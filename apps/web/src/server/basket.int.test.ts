import { describe, expect, it, vi } from "vitest";
import { db } from "@rinde/db";

// No live store lookups: this is about reading what's stored.
vi.mock("./offers", async (orig) => ({
  ...(await orig<typeof import("./offers")>()),
  lookupMissingEans: async (_e: string[], stores: string[]) => ({ found: [], answered: new Set(stores), reasons: [] }),
}));
const { priceBasket } = await import("./basket");

describe.skipIf(!process.env["INTEGRATION"])("pricing a saved basket (dev DB)", () => {
  it("prices a product at every store that has it, cheapest first, and leaves list ideas for the plan", async () => {
    // A barcode with a current online price at two or more stores.
    const [row] = await db().$queryRaw<{ id: string; stores: number }[]>`
      SELECT min(rp.id) AS id, count(DISTINCT r.slug)::int AS stores FROM "RetailerProduct" rp
      JOIN "Retailer" r ON r.id = rp."retailerId" JOIN "Product" p ON p.id = rp."productId"
      JOIN "PriceObservation" po ON po."retailerProductId" = rp.id
      WHERE p.ean IS NOT NULL AND r.slug IN ('d1', 'jumbo') AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - interval '30 hours'
      GROUP BY p.id HAVING count(DISTINCT r.slug) = 2 LIMIT 1`;
    const result = await priceBasket({ ids: [row!.id, "idea-banana"] }, ["d1", "jumbo"]);
    expect(result.unpriced).toEqual(["idea-banana"]);
    const [line] = result.lines;
    expect(line!.offers.map((o) => o.store).sort()).toEqual(["D1", "Jumbo"]);
    expect(line!.offers[0]!.price).toBeLessThanOrEqual(line!.offers[1]!.price);
    expect(line!.missing).toEqual([]);
  });
});
