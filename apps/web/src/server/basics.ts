import "server-only";
import { z } from "zod";
import { db, type RetailerSlug } from "@rinde/db";
import { priceBasket } from "./basket";
import type { Offer, Store } from "./contract";

export const basicsRequestSchema = z.object({
  /** Products this device picked from search (opened or added to its carrito), most used first */
  ids: z.array(z.string().max(150)).max(20).default([]),
});
export type BasicsRequest = z.infer<typeof basicsRequestSchema>;

/** Where a basic comes from: bought on a receipt, or picked from search results. */
export type BasicSource = "receipt" | "search";
export type Basic = { id: string; source: BasicSource; times: number; offers: Offer[]; inStore: Offer[]; missing: Store[] };

const MAX_BASICS = 8;
const RECEIPT_DAYS = 90;

/**
 * The person's own staples with today's prices: what their receipts show they buy, then what they picked
 * from search. A search term alone is too vague to choose a product from, so it isn't used.
 * Empty for someone new; the app then shows generic ideas.
 */
export async function basicsFor(sessionId: string | null, req: BasicsRequest, stores: RetailerSlug[]): Promise<Basic[]> {
  const prisma = db();
  const picks: { id: string; source: BasicSource; times: number }[] = [];

  const contributor = sessionId ? await prisma.contributor.findUnique({ where: { sessionId }, select: { id: true } }) : null;
  if (contributor) {
    const bought = await prisma.receiptLine.groupBy({
      by: ["retailerProductId"],
      where: {
        accepted: true, retailerProductId: { not: null },
        receipt: { contributorId: contributor.id, status: "confirmed", purchasedAt: { gt: new Date(Date.now() - RECEIPT_DAYS * 86_400_000) } },
      },
      _count: { _all: true },
      orderBy: { _count: { retailerProductId: "desc" } },
      take: MAX_BASICS,
    });
    for (const b of bought) picks.push({ id: b.retailerProductId!, source: "receipt", times: b._count._all });
  }
  for (const id of req.ids) picks.push({ id, source: "search", times: 1 });
  // One entry per product, keeping its strongest reason.
  const listings = await prisma.retailerProduct.findMany({ where: { id: { in: picks.map((p) => p.id) } }, select: { id: true, productId: true } });
  const productOf = new Map(listings.map((l) => [l.id, l.productId]));
  const seen = new Set<string>();
  const unique = picks.filter((p) => {
    const product = productOf.get(p.id);
    if (!product || seen.has(product)) return false;
    seen.add(product);
    return true;
  }).slice(0, MAX_BASICS);
  if (unique.length === 0) return [];

  const priced = new Map((await priceBasket({ ids: unique.map((u) => u.id) }, stores)).lines.map((l) => [l.id, l]));
  return unique.flatMap((u) => {
    const line = priced.get(u.id);
    return line ? [{ ...u, offers: line.offers, inStore: line.inStore, missing: line.missing }] : [];
  });
}
