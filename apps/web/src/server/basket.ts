import "server-only";
import { z } from "zod";
import { db, type RetailerSlug } from "@rinde/db";
import { storePrices } from "./compare";
import { type Offer, type Store } from "./contract";
import { eggKey, eggOf } from "./eggs";
import { eggListings, listingsForProducts, lookupMissingEans, toOffer, type ListingRow } from "./offers";
import { missingStores } from "./produce-online";

export const basketRequestSchema = z.object({
  ids: z.array(z.string().max(150)).min(1).max(20),
});
export type BasketRequest = z.infer<typeof basketRequestSchema>;

/** One basket product at every store: one price per store, cheapest first (see `storePrices`). */
export type BasketLine = { id: string; offers: Offer[]; inStore: Offer[]; missing: Store[] };
/** Totals depend on counts the user changes on the phone, so the app groups and adds up (apps/mobile/lib/basket.ts). */
export type BasketResult = {
  lines: BasketLine[];
  /** Products we can't price here (list ideas, or listings no store prices now); the plan searches for them */
  unpriced: string[];
  reasons: string[];
  checkedAt: string;
};

/** Re-prices a saved basket now: the same product at every store. */
export async function priceBasket(req: BasketRequest, stores: RetailerSlug[]): Promise<BasketResult> {
  const listings = await db().retailerProduct.findMany({
    where: { id: { in: req.ids } },
    select: { id: true, productId: true, name: true, product: { select: { ean: true, size: true, unit: true, category: true } } },
  });
  const productOf = new Map(listings.map((l) => [l.id, l]));
  // A carton of eggs is priced as its grade and count at each store, whatever the brand.
  const eggOfListing = new Map(listings.flatMap((l) => {
    const egg = eggOf({ name: l.name, size: l.product.size?.toString() ?? null, unit: l.product.unit, category: l.product.category });
    return egg ? [[l.id, eggKey(egg)] as const] : [];
  }));
  const productIds = [...new Set(listings.map((l) => l.productId))];

  const rows = [...(await listingsForProducts(productIds, stores)), ...(await listingsForProducts(productIds, stores, "receipt"))];
  const eans = [...new Set(listings.map((l) => l.product.ean).filter((e): e is string => !!e))];
  const live = await lookupMissingEans(eans, stores, (ean, slug) => rows.some((r) => r.ean === ean && r.slug === slug && !r.source.startsWith("community:")));
  rows.push(...live.found);
  const cartons: ListingRow[] = eggOfListing.size ? [...(await eggListings(stores)), ...(await eggListings(stores, "receipt"))] : [];

  const lines: BasketLine[] = [];
  const unpriced: string[] = [];
  for (const id of req.ids) {
    const listing = productOf.get(id);
    const key = eggOfListing.get(id);
    const same = key
      ? cartons.map(toOffer).filter((o) => o.egg && eggKey(o.egg) === key)
      : listing ? rows.filter((r) => r.productId === listing.productId).map(toOffer) : [];
    const { offers, inStore } = storePrices(same);
    if (offers.length === 0) {
      unpriced.push(id);
      continue;
    }
    const missing = missingStores(!!listing?.product.ean, offers[0]!.aisle, live.answered, offers);
    lines.push({ id, offers, inStore, missing });
  }
  return { lines, unpriced, reasons: live.reasons, checkedAt: new Date().toISOString() };
}
