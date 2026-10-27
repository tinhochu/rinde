import "server-only";
import { db, type RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG, type Store } from "./contract";

export const HISTORY_DAYS = 30;

/** One store's price for a listing on one day (Bogotá), the last one observed that day. */
export type HistoryPoint = { listingId: string; store: Store; day: string; price: number; source: "online" | "receipt" };

/**
 * Observed prices for the given listings over the last 30 days, one per listing per day. Only what was
 * observed: a day without an observation has no point, and nothing is interpolated.
 */
export async function priceHistory(listingIds: string[], now = new Date()): Promise<HistoryPoint[]> {
  if (listingIds.length === 0) return [];
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const rows = await db().$queryRaw<{ listingId: string; slug: RetailerSlug; day: string; price: number; source: string }[]>`
    SELECT DISTINCT ON (po."retailerProductId", day)
      po."retailerProductId" AS "listingId", r.slug, po.price, po.source,
      to_char(po."observedAt" AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS day
    FROM "PriceObservation" po
    JOIN "RetailerProduct" rp ON rp.id = po."retailerProductId"
    JOIN "Retailer" r ON r.id = rp."retailerId"
    WHERE po."retailerProductId" = ANY(${listingIds}) AND po."observedAt" >= ${since}
    ORDER BY po."retailerProductId", day, po."observedAt" DESC`;
  return rows
    .map((r) => ({ listingId: r.listingId, store: STORE_BY_SLUG[r.slug], day: r.day, price: r.price, source: r.source.startsWith("community:") ? "receipt" as const : "online" as const }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.store.localeCompare(b.store));
}
