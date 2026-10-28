import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, ensureRetailer, recordOffer } from "@rinde/db";
import type { MuseConfig } from "./muse";
import { similarProducts } from "./similar";

const RUN = `${Date.now()}`;
const letters = (s: string) => [...s].map((d) => "abcdefghij"[Number(d)]).join("");
// A head word no real listing starts with, so the pool holds only these.
const HEAD = `Lechezq${letters(RUN.slice(-6))}`;
const EANS = [0, 1, 2, 3].map((i) => `7${i}${RUN.slice(-11)}`);

const LISTINGS = [
  { name: `${HEAD} semidescremada Alpina 1100 ml`, brand: "Alpina", amount: 1100, price: 6000 },
  { name: `${HEAD} entera Colanta 1000 ml`, brand: "Colanta", amount: 1000, price: 4000 },
  { name: `${HEAD} semidescremada Alquería 900 ml`, brand: "Alquería", amount: 900, price: 4200 },
  { name: `${HEAD} 2.0 Parmalat 1100 ml`, brand: "Parmalat", amount: 1100, price: 5500 },
];

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });
function muse(text: string, calls: string[]): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 1000,
    fetch: (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string).input[0].content[0].text); return reply(text); }) as typeof fetch,
  };
}

describe.skipIf(!process.env["INTEGRATION"])("similarProducts (dev DB, Muse mocked)", () => {
  let target = "";

  beforeAll(async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    for (const [i, l] of LISTINGS.entries()) {
      const obs = await recordOffer(db(), jumbo.id, {
        retailer: "jumbo", externalId: `test-${EANS[i]}`, name: l.name, brand: l.brand, ean: EANS[i]!, category: "Leche",
        size: { amount: l.amount, unit: "ml" }, price: l.price, listPrice: l.price, available: true, stock: 5,
        url: "https://example.test/jumbo", imageUrl: null, source: "jumbo:vtex-catalog", sourceUrl: "https://example.test/jumbo/search", observedAt: new Date(),
      });
      if (i === 0) target = obs.retailerProductId;
    }
  });

  afterAll(async () => {
    const ids = (await db().product.findMany({ where: { ean: { in: EANS } }, select: { id: true } })).map((p) => p.id);
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("lists what Muse puts in the product's kind, with reasons, cheapest per liter first, never the product itself", async () => {
    const calls: string[] = [];
    // Shown as 0: the product, then the pool cheapest first: 1 entera, 2 Alquería 900 ml, 3 "2.0".
    const answer = {
      kinds: [
        { label: "Leche semidescremada", items: [{ item: 0, reason: "La que buscas" }, { item: 2, reason: "Semidescremada de otra marca" }, { item: 3, reason: "La Leche 2.0 es semidescremada" }] },
      ],
    };
    const products = await similarProducts(target, ["jumbo"], muse(JSON.stringify(answer), calls));

    expect(products.map((p) => [p.name, p.reason, p.similar])).toEqual([
      [LISTINGS[2]!.name, "Semidescremada de otra marca", true], // $4.200 / 0,9 L = $4.667 per L
      [LISTINGS[3]!.name, "La Leche 2.0 es semidescremada", true], // $5.500 / 1,1 L = $5.000 per L
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toMatch(/\$|6000|4000|4200|5500/);
  });
});
