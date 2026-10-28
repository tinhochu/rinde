import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import type { Offer } from "@rinde/retailers";
import type { MuseConfig } from "./muse";

// Live store answers, set per test.
const live = vi.hoisted(() => ({
  byEans: {} as Record<string, (eans: string[]) => Promise<unknown[]>>,
  search: {} as Record<string, (term: string) => Promise<unknown[]>>,
}));
vi.mock("@rinde/retailers", async (orig) => {
  const real = await orig<typeof import("@rinde/retailers")>();
  const stub = (slug: RetailerSlug) => ({
    ...real.retailerBySlug[slug],
    byEans: (eans: string[]) => (live.byEans[slug] ?? (async () => []))(eans),
    search: (term: string) => (live.search[slug] ?? (async () => []))(term),
  });
  return { ...real, retailerBySlug: { d1: stub("d1"), jumbo: stub("jumbo"), exito: stub("exito"), carulla: stub("carulla") } };
});

const { checkStores } = await import("./store-check");

const RUN = `${Date.now()}`;
const letters = (s: string) => [...s].map((d) => "abcdefghij"[Number(d)]).join("");
const BRAND = `Zq${letters(RUN.slice(-6))}`;
const EAN = `94${RUN.slice(-11)}`;
const OTHER_EAN = `93${RUN.slice(-11)}`;
const TWIN_EANS = [`92${RUN.slice(-11)}`, `91${RUN.slice(-11)}`];

const offer = (slug: RetailerSlug, ean: string, name: string, price: number, id = `${slug}-${ean}`): Offer => ({
  retailer: slug, externalId: `test-${id}`, name, brand: BRAND, ean, category: "Leche",
  size: { amount: 1000, unit: "ml" }, price, listPrice: price, available: true, stock: 10,
  url: `https://example.test/${slug}`, imageUrl: null, source: `${slug}:vtex-catalog`,
  sourceUrl: `https://example.test/${slug}/search`, observedAt: new Date(),
});

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });
const muse = (text: string): MuseConfig => ({
  apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 1000, fetch: (async () => reply(text)) as typeof fetch,
});
const noMuse: MuseConfig = { ...muse(""), apiKey: undefined };

describe.skipIf(!process.env["INTEGRATION"])("checkStores (dev DB, stores and Muse mocked)", () => {
  let listing = "";

  beforeAll(async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    listing = (await recordOffer(db(), jumbo.id, offer("jumbo", EAN, `Leche deslactosada ${BRAND} x1L`, 7900))).retailerProductId;
    // D1 sells it under another barcode and its own wording.
    const d1 = await ensureRetailer(db(), "d1");
    await recordOffer(db(), d1.id, offer("d1", OTHER_EAN, `Leche Deslact. ${BRAND} 1000 ml`, 6900));
  });

  afterAll(async () => {
    const ids = (await db().product.findMany({ where: { ean: { in: [EAN, OTHER_EAN] } }, select: { id: true } })).map((p) => p.id);
    await db().productMatch.deleteMany({ where: { OR: [{ fromProductId: { in: ids } }, { toProductId: { in: ids } }] } });
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("returns the stored price without asking, finds one store by barcode, rates-limited stays unchecked", async () => {
    const asked: string[] = [];
    live.byEans = {
      jumbo: async () => { asked.push("jumbo"); return []; },
      carulla: async (eans) => [offer("carulla", eans[0]!, `Leche ${BRAND} deslactosada (1000 ml)`, 8200)],
      exito: async () => { throw new Error("exito 429"); },
    };
    const { stores } = await checkStores(listing, ["jumbo", "carulla", "exito"], muse('{"pick":-1,"reason":"No"}'));
    expect(asked).toEqual([]);
    expect(stores).toEqual([
      expect.objectContaining({ store: "Jumbo", state: "price", offer: expect.objectContaining({ price: 7900 }) }),
      expect.objectContaining({ store: "Carulla", state: "price", offer: expect.objectContaining({ price: 8200 }) }),
      { store: "Éxito", state: "unchecked" },
    ]);
  });

  it("finds a store by Muse's judgment when the barcode differs, with its reason", async () => {
    live.byEans = {};
    const reason = "Misma leche deslactosada de 1 L; D1 la abrevia";
    const { stores } = await checkStores(listing, ["d1"], muse(JSON.stringify({ pick: 0, reason })));
    expect(stores).toEqual([{ store: "D1", state: "price", offer: expect.objectContaining({ price: 6900 }), reason }]);
  });
});

describe.skipIf(!process.env["INTEGRATION"])("checkStores when nothing matches (dev DB)", () => {
  const brand = `Zy${letters(RUN.slice(-6))}`;
  const ean = `90${RUN.slice(-11)}`;
  let listing = "";

  beforeAll(async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    listing = (await recordOffer(db(), jumbo.id, { ...offer("jumbo", ean, `Leche entera ${brand} x1L`, 5000), brand })).retailerProductId;
    // Two listings at Éxito that the strict rule can't tell apart.
    const exito = await ensureRetailer(db(), "exito");
    for (const [i, e] of TWIN_EANS.entries()) {
      await recordOffer(db(), exito.id, { ...offer("exito", e, i ? `Leche entera ${brand} bolsa 1000 ml` : `Leche Entera ${brand} 1 L`, 5200 + i), brand });
    }
  });

  afterAll(async () => {
    const ids = (await db().product.findMany({ where: { ean: { in: [ean, ...TWIN_EANS] } }, select: { id: true } })).map((p) => p.id);
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("says a store doesn't sell it only when both lookups answered and Muse picked none", async () => {
    live.byEans = {};
    live.search = {};
    const { stores } = await checkStores(listing, ["d1"], muse('{"pick":-1,"reason":"No"}'));
    expect(stores).toEqual([{ store: "D1", state: "not-sold" }]);
  });

  it("stays unchecked when the store's search fails", async () => {
    live.search = { carulla: async () => { throw new Error("carulla 429"); } };
    const { stores } = await checkStores(listing, ["carulla"], muse('{"pick":-1,"reason":"No"}'));
    expect(stores).toEqual([{ store: "Carulla", state: "unchecked" }]);
  });

  it("stays unchecked without Muse when the strict rule finds two listings", async () => {
    live.search = {};
    const { stores } = await checkStores(listing, ["exito"], noMuse);
    expect(stores).toEqual([{ store: "Éxito", state: "unchecked" }]);
  });
});
