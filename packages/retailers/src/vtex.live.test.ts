import { describe, expect, it } from "vitest";
import { carulla, d1, jumbo } from "./index";

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
  }, 60_000);

  it("fetches 3 D1 SKUs in a single request", async () => {
    const found = await d1.search("arroz", { limit: 3 });
    const ids = found.map((o) => o.externalId);
    expect(ids).toHaveLength(3);
    const offers = await d1.byIds(ids);
    expect(offers.map((o) => o.externalId).sort()).toEqual([...ids].sort());
  }, 60_000);

  it("finds priced Carulla milk with its size", async () => {
    const offers = (await carulla.search("leche entera", { limit: 10 })).filter((o) => o.available);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]?.price).toBeGreaterThan(0);
    expect(offers[0]?.size?.unit).toBe("ml");
  }, 60_000);
});
