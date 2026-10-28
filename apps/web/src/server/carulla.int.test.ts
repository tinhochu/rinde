import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { optimize } from "@rinde/core";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";

// No live store searches: these tests are about Carulla's stored prices in comparisons and plans.
vi.mock("./offers", async (orig) => ({ ...(await orig<typeof import("./offers")>()), searchLive: async () => ({ offers: [], failed: [] }) }));

const { candidatesFor } = await import("./candidates");
const { enabledRetailers } = await import("./offers");

const RUN = `${Date.now()}`;
const EAN = `99${RUN.slice(-11)}`; // not a real barcode: the same product at every store
const NAME = `Panela Zqxwv ${RUN} (500 gr)`;
const PRICES: Partial<Record<RetailerSlug, number>> = { d1: 2900, jumbo: 3100, carulla: 2400 };

describe.skipIf(!process.env["INTEGRATION"])("Carulla as a fourth store (dev DB)", () => {
  beforeAll(async () => {
    for (const [slug, price] of Object.entries(PRICES) as [RetailerSlug, number][]) {
      const retailer = await ensureRetailer(db(), slug);
      await recordOffer(db(), retailer.id, {
        retailer: slug, externalId: `test-${slug}-${RUN}`, name: NAME, brand: "Zqxwv", ean: EAN, category: "Panela",
        size: { amount: 500, unit: "g" }, price, listPrice: price, available: true, stock: 10,
        url: `https://example.test/${slug}`, imageUrl: null, source: `${slug}:vtex-catalog`,
        sourceUrl: `https://example.test/${slug}/search`, observedAt: new Date(),
      });
    }
  });
  afterAll(async () => {
    const product = await db().product.findUnique({ where: { ean: EAN }, select: { id: true } });
    if (!product) return;
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: product.id } } });
    await db().retailerProduct.deleteMany({ where: { productId: product.id } });
    await db().product.delete({ where: { id: product.id } });
  });

  it("is always enabled", () => {
    expect(enabledRetailers()).toContain("carulla");
  });

  it("compares Carulla's own price with the other stores and plans the trip there when it's cheapest", async () => {
    const item = await candidatesFor({ id: "panela", label: "2 panelas", query: `panela zqxwv ${RUN}`, brand: null, quantity: 1000, unit: "g", essential: true, allowSubstitute: false }, ["d1", "jumbo", "carulla"]);
    const ours = item.candidates.filter((c) => c.name === NAME);
    expect(Object.fromEntries(ours.map((c) => [c.retailer, c.price]))).toEqual(PRICES);

    const plan = optimize([{ ...item, candidates: ours }], { budget: 100_000, retailers: ["d1", "jumbo", "carulla"] });
    expect(plan.stores.map((s) => s.retailer)).toEqual(["carulla"]);
    expect(plan.stores[0]!.lines[0]!.candidate).toMatchObject({ retailer: "carulla", price: 2400 });
  });
});
