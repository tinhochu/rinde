import { afterEach, describe, expect, it, vi } from "vitest";
import { createVtexClient } from "./vtex";

type Seller = { sellerId: string; commertialOffer: { Price: number; ListPrice?: number; IsAvailable: boolean; AvailableQuantity: number } };

const product = (sellers: Seller[]) => ({
  productId: "p1",
  productName: "Leche entera ALPINA bolsa (1100  ml)",
  linkText: "leche-entera-alpina",
  items: [{ itemId: "501480", ean: "7702001041404", sellers }],
});
const own = (Price: number, IsAvailable = true): Seller => ({ sellerId: "1", commertialOffer: { Price, ListPrice: Price, IsAvailable, AvailableQuantity: IsAvailable ? 10 : 0 } });
const market = (Price: number): Seller => ({ sellerId: "13849", commertialOffer: { Price, ListPrice: Price, IsAvailable: true, AvailableQuantity: 3 } });

function clientReturning(sellers: Seller[], ownSellerId?: string) {
  process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify([product(sellers)]) })) as unknown as typeof fetch);
  return createVtexClient({
    slug: "carulla",
    name: "Carulla",
    baseUrl: "https://www.carulla.com",
    searchPath: "/io/api/catalog_system/pub/products/search",
    minIntervalMs: 0,
    ...(ownSellerId ? { ownSellerId } : {}),
  });
}

describe("own seller pricing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RETAILER_MIN_INTERVAL_MS"];
  });

  it("uses the store's own price and stock", async () => {
    const [offer] = await clientReturning([own(7700)], "1").search("leche");
    expect(offer).toMatchObject({ price: 7700, listPrice: 7700, available: true, stock: 10 });
  });

  it("keeps the store's price when a marketplace seller is cheaper", async () => {
    const [offer] = await clientReturning([market(6900), own(7700)], "1").search("leche");
    expect(offer).toMatchObject({ price: 7700, available: true, stock: 10 });
  });

  it("treats a product only a marketplace seller has as not available, with no price", async () => {
    const [offer] = await clientReturning([own(0, false), market(30500)], "1").search("leche");
    expect(offer).toMatchObject({ price: 0, available: false });
    const [missing] = await clientReturning([market(30500)], "1").search("leche");
    expect(missing).toMatchObject({ price: 0, available: false, stock: null });
  });

  it("without an own seller, takes the first seller actually selling (D1, Jumbo)", async () => {
    const [offer] = await clientReturning([own(0, false), market(30500)]).search("leche");
    expect(offer).toMatchObject({ price: 30500, available: true });
  });
});
