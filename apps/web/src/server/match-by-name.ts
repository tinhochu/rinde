import "server-only";
import type { MatchItem } from "@rinde/core";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import { retailerBySlug } from "@rinde/retailers";
import { aisleOf } from "./aisles";
import type { MuseConfig } from "./muse";
import { listingsOfSize, withTimeout, type ListingRow } from "./offers";
import { judgeSameProduct } from "./same-product";

export const NAME_MATCH_TIMEOUT_MS = 15_000;

export type NameMatch =
  | { state: "matched"; listingId: string; by: "muse" | "rules"; reason: string | null }
  | { state: "none"; reason: string | null }
  /** Muse was unavailable and the strict rule couldn't tell */
  | { state: "undecided" }
  /** The names fit more than one of the store's listings; Muse says why */
  | { state: "unsure"; reason: string };

/** The store didn't answer the live search: nothing can be said about it. */
export class StoreUnavailable extends Error {}

type Listing = MatchItem & { productId: string };

const toItem = (r: ListingRow): Listing => ({
  id: r.listingId, productId: r.productId, name: r.name, brand: r.brand,
  size: r.size && r.unit ? { amount: Number(r.size), unit: r.unit } : null, aisle: aisleOf(r.category, r.name),
});

/**
 * Finds `productId` at a store that has no listing with its barcode: candidates of the same size and
 * brand from the store's stored listings, judged by Muse; when none is the product, a live search at
 * the store for "<brand> <name words>" adds fresh candidates, judged again. A match moves the store's
 * listing (every listing of its product) onto this product and records why, so the product groups
 * across stores from then on. The price shown stays the listing's own stored price.
 */
export async function matchByName(productId: string, store: RetailerSlug, opts: { live?: boolean; cfg?: MuseConfig } = {}): Promise<NameMatch> {
  const product = await db().product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, name: true, brand: true, size: true, unit: true, category: true } });
  if (!product.brand || !product.size || !product.unit) return { state: "none", reason: null };
  const size = { amount: Number(product.size), unit: product.unit };
  const target: MatchItem = { id: product.id, name: product.name, brand: product.brand, size, aisle: aisleOf(product.category, product.name) };

  const pool = async () => (await listingsOfSize(size, product.brand!, [store])).filter((r) => r.productId !== productId).map(toItem);
  const stored = await pool();
  let verdict = await judgeSameProduct(target, stored, opts.cfg);

  if (!verdict.pick && !verdict.unsure && opts.live) {
    const words = product.name.split(/\s+/).filter((w) => !/\d/.test(w) && w.toLowerCase() !== product.brand!.toLowerCase()).slice(0, 3);
    let found;
    try {
      found = await withTimeout(retailerBySlug[store].search(`${product.brand} ${words.join(" ")}`, { limit: 20, patient: false }), NAME_MATCH_TIMEOUT_MS);
    } catch {
      throw new StoreUnavailable(store);
    }
    const retailer = await ensureRetailer(db(), store);
    for (const o of found) await recordOffer(db(), retailer.id, { ...o, source: `${store}:name-match` });
    const seen = new Set(stored.map((s) => s.id));
    const fresh = (await pool()).filter((l) => !seen.has(l.id));
    if (fresh.length) verdict = await judgeSameProduct(target, fresh, opts.cfg);
  }

  if (verdict.undecided) return { state: "undecided" };
  if (verdict.unsure) return { state: "unsure", reason: verdict.reason };
  if (!verdict.pick) return { state: "none", reason: verdict.reason };
  await link(verdict.pick.productId, productId, verdict.by, verdict.reason);
  return { state: "matched", listingId: verdict.pick.id, by: verdict.by, reason: verdict.reason };
}

/** Moves every listing of `from` onto `to`, one ProductMatch row each, so it can be seen and undone. */
async function link(from: string, to: string, by: "muse" | "rules", reason: string | null) {
  await db().$transaction(async (tx) => {
    const listings = await tx.retailerProduct.findMany({ where: { productId: from }, select: { id: true } });
    for (const l of listings) {
      await tx.retailerProduct.update({ where: { id: l.id }, data: { productId: to } });
      await tx.productMatch.upsert({
        where: { retailerProductId: l.id },
        create: { retailerProductId: l.id, fromProductId: from, toProductId: to, by, reason },
        update: { toProductId: to, by, reason, matchedAt: new Date() },
      });
    }
  });
}
