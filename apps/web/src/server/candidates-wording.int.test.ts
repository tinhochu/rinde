import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";

// No live store searches: these tests are about how the stored listings are found.
vi.mock("./offers", async (orig) => ({ ...(await orig<typeof import("./offers")>()), searchLive: async () => ({ offers: [], failed: [] }) }));

const { candidatesFor } = await import("./candidates");

const RUN = `${Date.now()}`;
const WORD = `zqxwv${RUN}`; // one made-up word, so only this test's listings match
const LISTINGS: { slug: RetailerSlug; name: string; size: number; price: number }[] = [
  // Nobody writes "lata" on a can of tuna.
  { slug: "jumbo", name: `Atún ${WORD} en agua 140g`, size: 140, price: 5200 },
  // D1's only listing with every word is a sauce, so D1 is still searched more loosely.
  { slug: "d1", name: `Salsa ${WORD} lata de atún 200 G`, size: 200, price: 900 },
  { slug: "d1", name: `Atún ${WORD} en aceite 170 G`, size: 170, price: 4800 },
];

describe.skipIf(!process.env["INTEGRATION"])("candidatesFor: list wording differs from store names (dev DB)", () => {
  beforeAll(async () => {
    for (const [i, l] of LISTINGS.entries()) {
      const retailer = await ensureRetailer(db(), l.slug);
      await recordOffer(db(), retailer.id, {
        retailer: l.slug, externalId: `wording-${RUN}-${i}`, name: l.name, brand: null, ean: `98${RUN.slice(-10)}${i}`, category: "Despensa",
        size: { amount: l.size, unit: "g" }, price: l.price, listPrice: l.price, available: true, stock: 10,
        url: `https://example.test/${i}`, imageUrl: null, source: `${l.slug}:vtex-catalog`,
        sourceUrl: "https://example.test/search", observedAt: new Date(),
      });
    }
  });
  afterAll(async () => {
    const products = await db().product.findMany({ where: { ean: { startsWith: `98${RUN.slice(-10)}` } }, select: { id: true } });
    const ids = products.map((p) => p.id);
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  const ask = (query: string, unit: "g" | "unit", quantity: number) =>
    candidatesFor({ id: query, label: query, query, brand: null, quantity, unit, essential: true, allowSubstitute: true }, ["d1", "jumbo"]);

  it('finds "atún en lata" as tuna, though no store says "lata"', async () => {
    const item = await ask(`atún ${WORD} en lata`, "unit", 3);
    const names = item.candidates.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining([`Atún ${WORD} en aceite 170 G`, `Atún ${WORD} en agua 140g`]));
    expect(names.filter((n) => n.startsWith("Salsa"))).toEqual([]);
  }, 60_000);
});
