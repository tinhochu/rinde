import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";

vi.mock("./offers", async (orig) => ({
  ...(await orig<typeof import("./offers")>()),
  searchLive: async () => ({ offers: [], failed: [] }),
  lookupMissingEans: async (_eans: string[], stores: RetailerSlug[]) => ({ found: [], answered: new Set(stores), reasons: [] }),
}));

const { compareProducts } = await import("./compare");

const RUN = `${Date.now()}`;
const letters = (s: string) => [...s].map((d) => "abcdefghij"[Number(d)]).join("");
const BRAND = `Zx${letters(RUN.slice(-6))}`;
const OWN = `Zw${letters(RUN.slice(-6))}`;
const EANS = [0, 1, 2, 3].map((i) => `8${i}${RUN.slice(-11)}`);

const offer = (slug: RetailerSlug, ean: string, name: string, brand: string, price: number) => ({
  retailer: slug, externalId: `test-${slug}-${ean}`, name, brand, ean, category: "Leche",
  size: { amount: 1000, unit: "ml" as const }, price, listPrice: price, available: true, stock: 10,
  url: `https://example.test/${slug}`, imageUrl: null, source: `${slug}:vtex-catalog`,
  sourceUrl: `https://example.test/${slug}/search`, observedAt: new Date(),
});

describe.skipIf(!process.env["INTEGRATION"])("a search naming a brand (dev DB)", () => {
  beforeAll(async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    const d1 = await ensureRetailer(db(), "d1");
    // Three products make it a known brand; D1 sells only its own label of milk.
    for (const [i, kind] of ["entera", "deslactosada", "descremada"].entries()) {
      await recordOffer(db(), jumbo.id, offer("jumbo", EANS[i]!, `Leche ${kind} ${BRAND} x1L`, BRAND, 4000 + i));
    }
    await recordOffer(db(), d1.id, offer("d1", EANS[3]!, `Leche Entera ${OWN} 1000 Ml`, OWN, 1));
  });

  afterAll(async () => {
    const ids = (await db().product.findMany({ where: { ean: { in: EANS } }, select: { id: true } })).map((p) => p.id);
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("shows other brands as similar, after the brand searched", async () => {
    const { products } = await compareProducts(`leche ${BRAND}`, ["d1", "jumbo"]);
    const ours = products.filter((p) => p.brand === BRAND);
    expect(ours).toHaveLength(3);
    expect(ours.every((p) => !p.similar)).toBe(true);
    // D1 has no such brand, so its milk (the cheapest is its own label, priced 1) comes back as similar, never as that brand's price.
    const d1 = products.filter((p) => p.offers.some((o) => o.store === "D1"));
    expect(d1.length).toBeGreaterThan(0);
    expect(d1.every((p) => p.similar)).toBe(true);
    expect(products.findIndex((p) => p.similar)).toBe(3);
  });

  it("marks nothing similar when the search names no brand", async () => {
    const { products } = await compareProducts(`leche entera`, ["d1", "jumbo"]);
    expect(products.some((p) => p.similar)).toBe(false);
  });
});
