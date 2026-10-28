import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import type { MuseConfig } from "./muse";

// No live store calls: these tests are about matching stored listings.
vi.mock("./offers", async (orig) => ({
  ...(await orig<typeof import("./offers")>()),
  searchLive: async () => ({ offers: [], failed: [] }),
  lookupMissingEans: async (_eans: string[], stores: RetailerSlug[]) => ({ found: [], answered: new Set(stores), reasons: [] }),
}));

const { matchByName } = await import("./match-by-name");
const { compareProducts } = await import("./compare");
const { priceBasket } = await import("./basket");

const RUN = `${Date.now()}`;
// A brand no real listing has, so the pool holds only these listings.
const BRAND = `Zq${[...RUN.slice(-6)].map((d) => "abcdefghij"[Number(d)]).join("")}`;
const JUMBO_EAN = `96${RUN.slice(-11)}`;
const D1_EAN = `95${RUN.slice(-11)}`;

const offer = (slug: RetailerSlug, ean: string, name: string, brand: string, price: number) => ({
  retailer: slug, externalId: `test-${slug}-${RUN}`, name, brand, ean, category: "Leche",
  size: { amount: 1000, unit: "ml" as const }, price, listPrice: price, available: true, stock: 10,
  url: `https://example.test/${slug}`, imageUrl: null, source: `${slug}:vtex-catalog`,
  sourceUrl: `https://example.test/${slug}/search`, observedAt: new Date(),
});

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });
const muse = (text: string): MuseConfig => ({
  apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 1000, fetch: (async () => reply(text)) as typeof fetch,
});

describe.skipIf(!process.env["INTEGRATION"])("matchByName (dev DB, Muse mocked)", () => {
  let jumboListing = "";
  let product = "";

  beforeAll(async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    const d1 = await ensureRetailer(db(), "d1");
    const obs = await recordOffer(db(), jumbo.id, offer("jumbo", JUMBO_EAN, `Leche deslactosada ${BRAND} x1L`, BRAND.toUpperCase(), 7900));
    await recordOffer(db(), d1.id, offer("d1", D1_EAN, `Leche Deslact. ${BRAND} 1000 ml`, BRAND, 6900));
    jumboListing = obs.retailerProductId;
    product = (await db().retailerProduct.findUniqueOrThrow({ where: { id: jumboListing } })).productId;
  });

  afterAll(async () => {
    const ids = (await db().product.findMany({ where: { ean: { in: [JUMBO_EAN, D1_EAN] } }, select: { id: true } })).map((p) => p.id);
    await db().productMatch.deleteMany({ where: { OR: [{ fromProductId: { in: ids } }, { toProductId: { in: ids } }] } });
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("moves the store's listing onto the product, with Muse's reason", async () => {
    const reason = `Misma leche ${BRAND} deslactosada de 1 L; D1 la abrevia`;
    const result = await matchByName(product, "d1", { cfg: muse(JSON.stringify({ pick: 0, reason })) });
    expect(result).toMatchObject({ state: "matched", by: "muse", reason });
    const match = await db().productMatch.findFirstOrThrow({ where: { toProductId: product } });
    expect(match).toMatchObject({ by: "muse", reason });
  });

  it("then shows both stores' prices in search and in the basket", async () => {
    const { products } = await compareProducts(`leche ${BRAND}`, ["d1", "jumbo"]);
    const ours = products.find((p) => p.offers.some((o) => o.name.includes(BRAND)));
    expect(ours?.offers.map((o) => [o.store, o.price])).toEqual([["D1", 6900], ["Jumbo", 7900]]);

    const basket = await priceBasket({ ids: [jumboListing] }, ["d1", "jumbo"]);
    expect(basket.lines[0]?.offers.map((o) => [o.store, o.price])).toEqual([["D1", 6900], ["Jumbo", 7900]]);
  });
});
