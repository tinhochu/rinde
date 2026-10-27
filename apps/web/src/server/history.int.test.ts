import { describe, expect, it } from "vitest";
import { db } from "@rinde/db";

const { priceHistory } = await import("./history");

describe.skipIf(!process.env["INTEGRATION"])("priceHistory (dev DB)", () => {
  it("returns at most one observed price per listing per day, oldest day first", async () => {
    // Listings observed more than once recently, so a day can hold several observations.
    const busy = await db().$queryRaw<{ id: string }[]>`
      SELECT "retailerProductId" AS id FROM "PriceObservation"
      WHERE "observedAt" > now() - interval '30 days'
      GROUP BY 1 HAVING count(*) > 1 LIMIT 3`;
    expect(busy.length).toBeGreaterThan(0);
    const points = await priceHistory(busy.map((b) => b.id));
    const keys = points.map((p) => `${p.listingId}:${p.day}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(points.map((p) => p.day)).toEqual([...points.map((p) => p.day)].sort());
    expect(points.every((p) => busy.some((b) => b.id === p.listingId) && p.price > 0)).toBe(true);
  });

  it("returns nothing for unknown listings rather than inventing points", async () => {
    expect(await priceHistory(["no-such-listing"])).toEqual([]);
  });
});
