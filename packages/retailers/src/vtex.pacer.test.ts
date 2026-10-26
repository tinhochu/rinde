import { afterEach, describe, expect, it, vi } from "vitest";
import { createVtexClient } from "./vtex";

const PRODUCT = {
  productId: "1",
  productName: "Arroz blanco 1000 g",
  brand: "Diana",
  linkText: "arroz-blanco",
  categories: ["/Mercado/Despensa/"],
  items: [
    {
      itemId: "10",
      ean: "7700000000001",
      images: [{ imageUrl: "https://example.com/a.jpg" }],
      sellers: [{ commertialOffer: { Price: 6000, ListPrice: 6500, IsAvailable: true } }],
    },
  ],
};

describe("vtex pacer + retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RETAILER_MIN_INTERVAL_MS"];
  });

  it("retries empty bodies, then parses JSON (mocked fetch: empty, empty, JSON)", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "  " })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify([PRODUCT]) });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = createVtexClient({
      slug: "d1",
      name: "D1",
      baseUrl: "https://www.d1.com.co",
      searchPath: "/api/catalog_system/pub/products/search",
    });
    const offers = await client.search("arroz", { limit: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.price).toBe(6000);
    expect(offers[0]?.ean).toBe("7700000000001");
    expect(offers[0]?.available).toBe(true);
  }, 30_000);

  it("gives up after 3 attempts on persistent 500s", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = createVtexClient({
      slug: "jumbo",
      name: "Jumbo",
      baseUrl: "https://www.jumbocolombia.com",
      searchPath: "/api/catalog_system/pub/products/search",
    });
    await expect(client.search("arroz")).rejects.toThrow("jumbo 500");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 30_000);

  it("fails fast on 4xx without retrying", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = createVtexClient({
      slug: "jumbo",
      name: "Jumbo",
      baseUrl: "https://www.jumbocolombia.com",
      searchPath: "/api/catalog_system/pub/products/search",
    });
    await expect(client.search("arroz")).rejects.toThrow("jumbo 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
