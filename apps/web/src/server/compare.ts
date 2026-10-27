import "server-only";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import { retailerBySlug } from "@rinde/retailers";
import { STORE_BY_SLUG, type ComparedProduct, type Offer, type Store } from "./contract";
import { findOffers, isThingFor, LIVE_TIMEOUT_MS, listingsByEan, searchListings, toOffer, withTimeout } from "./offers";

const MAX_PRODUCTS = 24;
/** Products known only from receipts (mostly produce) shown on top of the online ones */
const MAX_REPORTED_ONLY = 8;

/** Same barcode, or for produce the same canonical item sold the same way (per kg or per unit). */
const groupKey = (o: Offer) => (o.produce ? `produce:${o.produce.slug}:${o.produce.per}` : o.ean ? `ean:${o.ean}` : `id:${o.id}`);

/** Cheapest offer per store, cheapest store first. */
const cheapestPerStore = (list: Offer[]) =>
  [...new Map([...list].sort((a, b) => b.price - a.price).map((o) => [o.store, o])).values()].sort((a, b) => a.price - b.price);

/**
 * Search, then line up each product across stores by EAN: the stored snapshot first,
 * then one batched live lookup per store for the EANs still missing there. Receipt prices
 * join the same groups, and products only reported on receipts get groups of their own.
 */
export async function compareProducts(term: string, stores: RetailerSlug[]) {
  const { offers, reasons } = await findOffers(term, { stores, perStore: 12 });

  const groups = new Map<string, Offer[]>();
  for (const o of offers) groups.set(groupKey(o), [...(groups.get(groupKey(o)) ?? []), o]);
  const online = [...groups.keys()].slice(0, MAX_PRODUCTS);
  const reportedOnly: string[] = [];
  for (const o of (await searchListings(term, { stores, perStore: 12, source: "receipt" })).map(toOffer)) {
    const key = groupKey(o);
    if (!groups.has(key)) {
      if (reportedOnly.length >= MAX_REPORTED_ONLY) continue;
      reportedOnly.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(o);
  }
  const keys = [...online, ...reportedOnly];
  const eans = keys.filter((k) => k.startsWith("ean:")).map((k) => k.slice(4));

  const add = (list: Offer[]) => {
    for (const o of list) {
      const group = groups.get(`ean:${o.ean}`);
      if (group && !group.some((x) => x.id === o.id && x.source === o.source)) group.push(o);
    }
  };
  add((await listingsByEan(eans, stores)).map(toOffer));
  add((await listingsByEan(eans, stores, "receipt")).map(toOffer));

  // Stores we could check for a given EAN; a failed live lookup leaves the answer unknown.
  const checked = new Set<RetailerSlug>(stores);
  const prisma = db();
  await Promise.all(
    stores.map(async (slug) => {
      const store = STORE_BY_SLUG[slug];
      const wanted = eans.filter((ean) => !groups.get(`ean:${ean}`)!.some((o) => o.store === store && o.source === "online"));
      if (wanted.length === 0) return;
      try {
        const found = await withTimeout(retailerBySlug[slug].byEans(wanted), LIVE_TIMEOUT_MS);
        const retailer = await ensureRetailer(prisma, slug);
        for (const o of found) await recordOffer(prisma, retailer.id, { ...o, source: `${slug}:live-ean` });
        if (found.length) add((await listingsByEan(found.map((o) => o.ean!), [slug])).map(toOffer));
      } catch {
        checked.delete(slug);
        reasons.push(`${store}: no pudimos confirmar qué productos tiene; puede tenerlos.`);
      }
    }),
  );

  const products = keys.map((key): ComparedProduct => {
    const all = groups.get(key)!;
    const onlineBest = cheapestPerStore(all.filter((o) => o.source === "online"));
    const reported = cheapestPerStore(all.filter((o) => o.source === "receipt"));
    // A store's price is its online one when it has it; a receipt price stands in only where it doesn't.
    const best = [...onlineBest, ...reported.filter((r) => !onlineBest.some((o) => o.store === r.store))].sort((a, b) => a.price - b.price);
    const lead = best[0]!;
    const byEan = key.startsWith("ean:");
    const missing: Store[] = byEan
      ? [...checked].map((s) => STORE_BY_SLUG[s]).filter((s) => !best.some((o) => o.store === s))
      : [];
    const sized = best.find((o) => o.pack > 0) ?? lead;
    return {
      key,
      name: lead.name,
      brand: lead.brand,
      ean: lead.ean,
      pack: sized.pack,
      unit: sized.unit,
      image: best.find((o) => o.image)?.image ?? "",
      offers: best,
      inStore: reported.filter((r) => onlineBest.some((o) => o.store === r.store)),
      missing,
      // Any store's specific category beats a generic one.
      aisle: best.find((o) => o.aisle !== "other")?.aisle ?? "other",
      spread: best.length > 1 ? best.at(-1)!.price - lead.price : 0,
      ...(lead.produce ? { produce: lead.produce } : {}),
    };
  });

  // The searched thing before things that only mention it ("Manzana" before "Gaseosa … manzana"),
  // then products sold in more stores: that's the comparison people came for.
  const isThing = isThingFor(term);
  products.sort((a, b) => Number(isThing(b)) - Number(isThing(a)) || b.offers.length - a.offers.length || a.offers[0]!.price - b.offers[0]!.price);
  // One fruit's per-kg and per-unit groups sit together; each keeps its own verdict.
  const ordered: ComparedProduct[] = [];
  for (const p of products) {
    if (ordered.includes(p)) continue;
    ordered.push(p);
    if (p.produce) ordered.push(...products.filter((q) => q !== p && q.produce?.slug === p.produce!.slug));
  }
  return { offers, products: ordered, reasons };
}

