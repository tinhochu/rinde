import "server-only";
import type { RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG, type ComparedProduct, type Offer, type Store } from "./contract";
import { eggKey, eggLabel } from "./eggs";
import { eggListings, findOffers, isThingFor, listingsByEan, lookupMissingEans, searchListings, toOffer } from "./offers";
import { missingStores } from "./produce-online";

const MAX_PRODUCTS = 24;
/** Products known only from receipts (mostly produce) shown on top of the online ones */
const MAX_REPORTED_ONLY = 8;

/**
 * Same barcode; for produce the same canonical item sold the same way (per kg or per unit); for eggs
 * the same grade and count, since shoppers swap brands of eggs freely.
 */
const groupKey = (o: Offer) =>
  o.produce ? `produce:${o.produce.slug}:${o.produce.per}` : o.egg ? eggKey(o.egg) : o.ean ? `ean:${o.ean}` : `id:${o.id}`;

/** Cheapest offer per store, cheapest store first. */
const cheapestPerStore = (list: Offer[]) =>
  [...new Map([...list].sort((a, b) => b.price - a.price).map((o) => [o.store, o])).values()].sort((a, b) => a.price - b.price);

/**
 * One price per store for one product, cheapest store first: its online price when it has one, a receipt
 * price only where it doesn't. Receipt prices for stores with an online price come back as `inStore`.
 */
export function storePrices(all: Offer[]) {
  const online = cheapestPerStore(all.filter((o) => o.source === "online"));
  const reported = cheapestPerStore(all.filter((o) => o.source === "receipt"));
  const hasOnline = (o: Offer) => online.some((x) => x.store === o.store);
  return {
    offers: [...online, ...reported.filter((r) => !hasOnline(r))].sort((a, b) => a.price - b.price),
    inStore: reported.filter(hasOnline),
  };
}

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

  // Every store's cartons of the grades and counts shown, not only those the search ranked first.
  if (keys.some((k) => k.startsWith("egg:"))) {
    const cartons = [...(await eggListings(stores)), ...(await eggListings(stores, "receipt"))].map(toOffer);
    for (const o of cartons) {
      const group = o.egg && groups.get(eggKey(o.egg));
      if (group && !group.some((x) => x.id === o.id && x.source === o.source)) group.push(o);
    }
  }

  // Stores we could check for a given EAN; a failed live lookup leaves the answer unknown.
  const live = await lookupMissingEans(eans, stores, (ean, slug) =>
    groups.get(`ean:${ean}`)!.some((o) => o.store === STORE_BY_SLUG[slug] && o.source === "online"));
  add(live.found.map(toOffer));
  reasons.push(...live.reasons);
  const checked = live.answered;

  const products = keys.map((key): ComparedProduct => {
    const { offers: best, inStore } = storePrices(groups.get(key)!);
    const lead = best[0]!;
    const byEan = key.startsWith("ean:");
    const missing: Store[] = missingStores(byEan, lead.aisle, checked, best);
    const sized = best.find((o) => o.pack > 0) ?? lead;
    // Cartons from several brands are named by what they share; each store line keeps its brand.
    const brands = new Set(best.map((o) => o.brand));
    const egg = lead.egg && brands.size > 1 ? lead.egg : undefined;
    return {
      key,
      name: egg ? eggLabel(egg) : lead.name,
      brand: egg ? "Varias marcas" : lead.brand,
      ean: lead.ean,
      pack: egg ? egg.count : sized.pack,
      unit: egg ? "und" : sized.unit,
      image: best.find((o) => o.image)?.image ?? "",
      offers: best,
      inStore,
      missing,
      // Any store's specific category beats a generic one.
      aisle: best.find((o) => o.aisle !== "other")?.aisle ?? "other",
      spread: best.length > 1 ? best.at(-1)!.price - lead.price : 0,
      ...(lead.produce ? { produce: lead.produce } : {}),
      ...(egg ? { egg } : {}),
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

