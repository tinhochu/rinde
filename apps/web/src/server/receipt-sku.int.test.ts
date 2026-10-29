import { afterAll, describe, expect, it, vi } from "vitest";
import type { ParsedLine } from "@rinde/core";
import { db, ensureRetailer, recordOffer } from "@rinde/db";
import type { Offer } from "@rinde/retailers";

// No live store calls: the store's SKU lookup is mocked, and Muse is down so nothing else picks a product.
const live = vi.hoisted(() => ({ asked: [] as string[], offers: [] as Offer[], down: false }));
vi.mock("@rinde/retailers", async (orig) => {
  const actual = await orig<typeof import("@rinde/retailers")>();
  const byIds = async (skus: string[]) => {
    live.asked.push(...skus);
    if (live.down) throw new Error("mocked outage");
    return live.offers.filter((o) => skus.includes(o.externalId));
  };
  return { ...actual, retailerBySlug: { ...actual.retailerBySlug, exito: { ...actual.retailerBySlug.exito, byIds } } };
});
vi.mock("./muse", async (orig) => {
  const actual = await orig<typeof import("./muse")>();
  return { ...actual, chooseCandidates: async () => { throw new actual.MuseUnavailable("mocked"); } };
});

const { matchLines } = await import("./receipt-match");

const RUN = `${Date.now()}`.slice(-9);
const sku = (n: number) => `9${RUN}${n}`;
const offer = (n: number, name: string): Offer => ({
  retailer: "exito", externalId: sku(n), name, brand: null, ean: `97${RUN}${n}`, category: "Despensa",
  size: { amount: 354, unit: "g" }, price: 8600, listPrice: 8600, available: true, stock: 10,
  url: `https://example.test/${n}`, imageUrl: null, source: "exito:vtex-catalog", sourceUrl: "https://example.test/search", observedAt: new Date(),
});
const line = (index: number, text: string, code: string | null): ParsedLine => ({ index, kind: "item", text, code, quantity: null, unitPrice: 8600, total: 8600 });

describe.skipIf(!process.env["INTEGRATION"])("matchLines: Grupo Éxito prints its SKU as the line code (dev DB)", () => {
  afterAll(async () => {
    const ids = (await db().product.findMany({ where: { ean: { startsWith: `97${RUN}` } }, select: { id: true } })).map((p) => p.id);
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("matches a stored listing by its SKU without asking the store", async () => {
    const retailer = await ensureRetailer(db(), "exito");
    await recordOffer(db(), retailer.id, offer(1, "Galletas SALTIN NOEL tradicional x4 tacos (354 gr)"));
    live.asked = [];
    const [r] = await matchLines("exito", "Éxito", [line(0, "GALLETAS X 4 TACO", sku(1))]);
    expect(r!.match).toMatchObject({ name: "Galletas SALTIN NOEL tradicional x4 tacos (354 gr)", by: "code" });
    expect(live.asked).toEqual([]);
  });

  it("looks an unknown SKU up at the store, saves the listing and matches it", async () => {
    live.offers = [offer(2, "Pan tajado PERMAN brioche (370 gr)")];
    const [r] = await matchLines("exito", "Éxito", [line(0, "Pan Tajado Brioche", sku(2))]);
    expect(r!.match).toMatchObject({ name: "Pan tajado PERMAN brioche (370 gr)", by: "code" });
    const saved = await db().retailerProduct.findFirst({ where: { externalId: sku(2) }, select: { id: true } });
    expect(r!.match!.listingId).toBe(saved!.id);
  });

  it("falls back to the other steps when the store doesn't answer", async () => {
    live.down = true;
    const [r] = await matchLines("exito", "Éxito", [line(0, `zqxwv${RUN} unknown`, sku(3))]);
    live.down = false;
    expect(r!.match).toBeNull();
  });
});
