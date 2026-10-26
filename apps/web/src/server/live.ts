import "server-only";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import { retailerBySlug } from "@rinde/retailers";
import type { LiveResult, VerifyDeps } from "./verify";

/**
 * Live re-check of specific listings: one batched request per retailer. Every result is
 * recorded as a new observation (source "<retailer>:live-verify") before it is used.
 */
export const liveDeps: VerifyDeps = {
  async fetchLive(retailer: RetailerSlug, listingIds: string[]) {
    const prisma = db();
    const listings = await prisma.retailerProduct.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, externalId: true },
    });
    const listingBySku = new Map(listings.map((l) => [l.externalId, l.id]));
    const offers = await retailerBySlug[retailer].byIds([...listingBySku.keys()]);
    const { id: retailerId } = await ensureRetailer(prisma, retailer);

    const results = new Map<string, LiveResult>(listingIds.map((id) => [id, null]));
    for (const offer of offers) {
      const listingId = listingBySku.get(offer.externalId);
      if (!listingId) continue;
      const observation = await recordOffer(prisma, retailerId, { ...offer, source: `${retailer}:live-verify` });
      if (offer.available)
        results.set(listingId, { price: offer.price, observedAt: offer.observedAt.toISOString(), observationId: observation.id });
    }
    return results;
  },
};
