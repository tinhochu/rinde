import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, ensureRetailer, recordOffer, type ObservedOffer } from "@rinde/db";

vi.stubEnv("INGEST_EXITO", "1");
vi.stubEnv("DEUNA_API_KEY", "old-test-key, new-test-key");

const storesRoute = (await import("@/app/api/deuna/v1/stores/route")).GET;
const productsRoute = (await import("@/app/api/deuna/v1/stores/[storeId]/products/route")).GET;
const productRoute = (await import("@/app/api/deuna/v1/stores/[storeId]/products/[sku]/route")).GET;

const RUN = `test-deuna-${Date.now()}`;
const KEY = { "x-api-key": "new-test-key" };
const BASE = "http://localhost/api/deuna/v1/stores";
const ITEM_KEYS = ["brand", "category", "ean", "name", "observedAt", "referencePriceCop", "size", "sku"];

const get = (url: string, headers: Record<string, string> = KEY) => new Request(url, { headers });
const products = (storeId: string, qs = "", headers?: Record<string, string>) =>
  productsRoute(get(`${BASE}/${storeId}/products${qs}`, headers), { params: Promise.resolve({ storeId }) });
const product = (storeId: string, sku: string) => productRoute(get(`${BASE}/${storeId}/products/${sku}`), { params: Promise.resolve({ storeId, sku }) });

// Made-up Jumbo listings with a made-up word, so the dev DB's real catalogue doesn't interfere.
const CATEGORY = `Zqxwv ${RUN}`;
const offer = (n: string, name: string, price: number, extra: Partial<ObservedOffer> = {}): ObservedOffer => ({
  retailer: "jumbo", externalId: `${RUN}-${n}`, name, brand: "Zqxwv", ean: null, category: CATEGORY,
  size: { amount: 1000, unit: "g" }, price, listPrice: null, available: true, stock: 5,
  url: `https://example.com/${n}`, imageUrl: `https://example.com/${n}.jpg`, source: "jumbo:test", sourceUrl: "https://example.com", observedAt: new Date(),
  ...extra,
});
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

describe.skipIf(!process.env["INTEGRATION"])("DeUna catalogue API (dev DB)", () => {
  beforeAll(async () => {
    const prisma = db();
    const jumbo = await ensureRetailer(prisma, "jumbo");
    const seed = [
      offer("a", "Zqxwv Arroz Blanco", 5200, { size: { amount: 500, unit: "g" } }),
      offer("b", "Zqxwv Arroz Integral", 4100),
      offer("c", "Arroz Zqxwv Diana", 3000, { size: { amount: 6, unit: "unit" } }),
      offer("d", "Zqxwves Panela", 2500, { size: null }),
      offer("e", "Zqxwv Agotado", 1000),
    ];
    for (const o of seed) await recordOffer(prisma, jumbo.id, o);
    // An older price for (b) and a newer one: the newer counts.
    await recordOffer(prisma, jumbo.id, offer("b", "Zqxwv Arroz Integral", 9999, { observedAt: hoursAgo(48) }));
    // (e) sold out on its latest check: it has no current price.
    await recordOffer(prisma, jumbo.id, offer("e", "Zqxwv Agotado", 1000, { observedAt: hoursAgo(-0.01), available: false }));
    // A price reported on a receipt is not the online catalogue.
    await recordOffer(prisma, jumbo.id, offer("f", "Zqxwv Comunidad", 100, { source: "community:receipt" }));
  });

  afterAll(async () => {
    const prisma = db();
    const listings = await prisma.retailerProduct.findMany({ where: { externalId: { startsWith: RUN } }, select: { id: true, productId: true } });
    await prisma.priceObservation.deleteMany({ where: { retailerProductId: { in: listings.map((l) => l.id) } } });
    await prisma.retailerProduct.deleteMany({ where: { id: { in: listings.map((l) => l.id) } } });
    await prisma.product.deleteMany({ where: { id: { in: listings.map((l) => l.productId) } } });
  });

  describe("auth", () => {
    it("401 without a key, and with a wrong one", async () => {
      const missing = await storesRoute(get(BASE, {}));
      expect(missing.status).toBe(401);
      expect(await missing.json()).toMatchObject({ error: "unauthorized" });
      expect((await storesRoute(get(BASE, { "x-api-key": "new-test-ke" }))).status).toBe(401);
      expect((await products("jumbo", "", { "x-api-key": "nope" })).status).toBe(401);
    });

    it("accepts either key while one is rotated out", async () => {
      expect((await storesRoute(get(BASE, { "x-api-key": "old-test-key" }))).status).toBe(200);
      expect((await storesRoute(get(BASE))).status).toBe(200);
    });

    it("503 for everyone when the server has no key (fails closed)", async () => {
      vi.stubEnv("DEUNA_API_KEY", "");
      try {
        const res = await storesRoute(get(BASE));
        expect(res.status).toBe(503);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect((await products("jumbo", "", {})).status).toBe(503);
      } finally {
        vi.stubEnv("DEUNA_API_KEY", "old-test-key, new-test-key");
      }
    });
  });

  it("lists the four stores with their priced product count and last snapshot", async () => {
    const res = await storesRoute(get(BASE));
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    const { stores } = await res.json();
    expect(stores.map((s: { id: string }) => s.id).sort()).toEqual(["carulla", "d1", "exito", "jumbo"]);
    const jumbo = stores.find((s: { id: string }) => s.id === "jumbo");
    expect(Object.keys(jumbo).sort()).toEqual(["id", "lastIngestedAt", "name", "productCount"]);
    expect(jumbo.name).toBe("Jumbo");
    expect(jumbo.productCount).toBeGreaterThanOrEqual(4);
    expect(jumbo.lastIngestedAt === null || !Number.isNaN(Date.parse(jumbo.lastIngestedAt))).toBe(true);
  });

  it("searches with Rinde's relevance: names that start with the word first, then cheapest", async () => {
    const res = await products("jumbo", `?q=ZQXWV&category=${encodeURIComponent(CATEGORY)}`);
    expect(res.status).toBe(200);
    const { items, nextCursor } = await res.json();
    expect(nextCursor).toBeNull();
    // (e) is sold out and (f) is a receipt price: neither shows.
    expect(items.map((i: { sku: string }) => i.sku)).toEqual([`${RUN}-d`, `${RUN}-b`, `${RUN}-a`, `${RUN}-c`]);
    expect(items[1]).toMatchObject({ referencePriceCop: 4100, size: "1 kg", ean: null, brand: "Zqxwv", category: CATEGORY });
    for (const item of items) expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
    expect(items.map((i: { size: string | null }) => i.size)).toEqual([null, "1 kg", "500 g", "6 und"]);
  });

  it("pages through results with the cursor, without repeats or gaps", async () => {
    for (const qs of [`?q=zqxwv&category=${encodeURIComponent(CATEGORY)}`, `?category=${encodeURIComponent(CATEGORY)}`]) {
      const all = (await (await products("jumbo", qs)).json()).items.map((i: { sku: string }) => i.sku);
      expect(all).toHaveLength(4);
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: { items: { sku: string }[]; nextCursor: string | null } = await (await products("jumbo", `${qs}&limit=3${cursor ? `&cursor=${cursor}` : ""}`)).json();
        seen.push(...page.items.map((i) => i.sku));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 5);
      expect(pages).toBe(2);
      expect(seen).toEqual(all);
    }
  });

  it("browses a category alphabetically", async () => {
    const { items } = await (await products("jumbo", `?category=${encodeURIComponent(CATEGORY.toLowerCase())}`)).json();
    expect(items.map((i: { name: string }) => i.name)).toEqual(["Arroz Zqxwv Diana", "Zqxwv Arroz Blanco", "Zqxwv Arroz Integral", "Zqxwves Panela"]);
  });

  it("finds one product by sku, and 404s a missing or sold-out one", async () => {
    const res = await product("jumbo", `${RUN}-b`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sku: `${RUN}-b`, name: "Zqxwv Arroz Integral", referencePriceCop: 4100 });
    expect((await product("jumbo", `${RUN}-missing`)).status).toBe(404);
    expect((await product("jumbo", `${RUN}-e`)).status).toBe(404);
    // Another store's listing isn't Jumbo's.
    expect((await product("d1", `${RUN}-b`)).status).toBe(404);
  });

  it("404s an unknown store", async () => {
    expect((await products("olimpica")).status).toBe(404);
    expect((await product("olimpica", `${RUN}-b`)).status).toBe(404);
  });

  it("400s bad parameters with the zod issues", async () => {
    const tooMany = await products("jumbo", "?limit=51");
    expect(tooMany.status).toBe(400);
    const body = await tooMany.json();
    expect(body).toMatchObject({ error: "invalid_request" });
    expect(body.issues[0].path).toEqual(["limit"]);
    expect((await products("jumbo", "?limit=0")).status).toBe(400);
    expect((await products("jumbo", "?q=a")).status).toBe(400);
    expect((await products("jumbo", "?cursor=not-a-cursor")).status).toBe(400);
    // A browse cursor can't continue a search.
    const browse = await (await products("jumbo", `?category=${encodeURIComponent(CATEGORY)}&limit=1`)).json();
    expect((await products("jumbo", `?q=zqxwv&cursor=${browse.nextCursor}`)).status).toBe(400);
  });
});
