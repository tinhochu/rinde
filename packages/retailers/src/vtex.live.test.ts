import { describe, expect, it } from "vitest";
import { d1, jumbo } from "./index";

// Hits the real retailer sites. Run with: LIVE=1 pnpm --filter @rinde/retailers test
describe.skipIf(!process.env["LIVE"])("live VTEX clients", () => {
  it("finds the same EAN at D1 and Jumbo", async () => {
    const ean = "7702193100927"; // Avena en hojuelas Quaker 400 g
    const [a, b] = await Promise.all([d1.byEan(ean), jumbo.byEan(ean)]);
    for (const offers of [a, b]) {
      expect(offers[0]?.ean).toBe(ean);
      expect(offers[0]?.price).toBeGreaterThan(0);
      expect(offers[0]?.size).toEqual({ amount: 400, unit: "g" });
    }
  }, 30_000);
});
