import "server-only";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import { retailerBySlug } from "@rinde/retailers";
import { STORE_BY_SLUG, type Offer, type Store } from "./contract";
import { matchByName, NAME_MATCH_TIMEOUT_MS, StoreUnavailable } from "./match-by-name";
import { museConfig, type MuseConfig } from "./muse";
import { listingsForProducts, toOffer, withTimeout } from "./offers";

/**
 * - `price`: the store's own stored price (`reason` says why it's the same product when Muse matched it)
 * - `not-sold`: the store answered the barcode and name lookups and has nothing that is this product
 * - `unsure`: the store answered, but its listings' names fit more than one product; no price, Muse's reason
 * - `unchecked`: the store didn't answer, or nothing could tell; never a "doesn't sell it"
 */
export type StoreCheck =
  | { store: Store; state: "price"; offer: Offer; reason?: string }
  | { store: Store; state: "not-sold"; reason?: string }
  | { store: Store; state: "unsure"; reason: string }
  | { store: Store; state: "unchecked" };

export type StoreCheckResult = { stores: StoreCheck[]; checkedAt: string };

/** The cheapest current online offer per store for this product, with the match reason of a listing Muse matched. */
async function priced(productId: string, stores: RetailerSlug[]) {
  const rows = await listingsForProducts([productId], stores);
  const reasons = new Map(
    (await db().productMatch.findMany({ where: { retailerProductId: { in: rows.map((r) => r.listingId) } }, select: { retailerProductId: true, reason: true } }))
      .map((m) => [m.retailerProductId, m.reason]),
  );
  const best = new Map<RetailerSlug, { offer: Offer; reason?: string }>();
  for (const r of [...rows].sort((a, b) => a.price - b.price)) {
    if (best.has(r.slug)) continue;
    const reason = reasons.get(r.listingId);
    best.set(r.slug, { offer: toOffer(r), ...(reason ? { reason } : {}) });
  }
  return best;
}

/**
 * "Buscar en todas las tiendas": every store without a current price for the product is asked live,
 * by barcode and then by name with Muse's judgment, all stores at once. Prices found are recorded
 * before they're shown; stores already priced aren't asked again.
 */
export async function checkStores(listingId: string, stores: RetailerSlug[], cfg: MuseConfig = { ...museConfig(), timeoutMs: NAME_MATCH_TIMEOUT_MS }): Promise<StoreCheckResult> {
  const listing = await db().retailerProduct.findUniqueOrThrow({ where: { id: listingId }, select: { productId: true, product: { select: { ean: true } } } });
  const { productId } = listing;
  const ean = listing.product.ean;
  const before = await priced(productId, stores);

  const checks = await Promise.all(
    stores.map(async (slug): Promise<StoreCheck> => {
      const store = STORE_BY_SLUG[slug];
      const known = before.get(slug);
      if (known) return { store, state: "price", ...known };
      try {
        if (ean) {
          const found = await withTimeout(retailerBySlug[slug].byEans([ean]), NAME_MATCH_TIMEOUT_MS);
          const retailer = await ensureRetailer(db(), slug);
          for (const o of found) await recordOffer(db(), retailer.id, { ...o, source: `${slug}:live-ean` });
          const now = (await priced(productId, [slug])).get(slug);
          if (now) return { store, state: "price", ...now };
        }
        const match = await matchByName(productId, slug, { live: true, cfg });
        if (match.state === "undecided") return { store, state: "unchecked" };
        if (match.state === "unsure") return { store, state: "unsure", reason: match.reason };
        if (match.state === "none") return { store, state: "not-sold", ...(match.reason ? { reason: match.reason } : {}) };
        const now = (await priced(productId, [slug])).get(slug);
        return now ? { store, state: "price", ...now } : { store, state: "unchecked" };
      } catch (error) {
        // A 429, a timeout or an error from the store: nothing can be said about it.
        if (!(error instanceof StoreUnavailable)) console.warn(`[store-check] ${slug}:`, String(error));
        return { store, state: "unchecked" };
      }
    }),
  );
  return { stores: checks, checkedAt: new Date().toISOString() };
}
