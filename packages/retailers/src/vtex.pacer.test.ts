import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimited, createVtexClient } from "./vtex";

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

  const tooMany = { ok: false, status: 429, headers: new Headers(), text: async () => "" };
  const store = (slug: "exito" | "carulla", rateGroup: string) => createVtexClient({
    slug, name: slug, baseUrl: `https://www.${slug}.com`, searchPath: "/io/api/catalog_system/pub/products/search", rateGroup,
  });

  it("cools down every store in a rate group after a 429 at one of them", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const fetchMock = vi.fn().mockResolvedValue(tooMany);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(store("exito", "group-a").search("arroz", { patient: false })).rejects.toBeInstanceOf(RateLimited);
    await expect(store("carulla", "group-a").search("arroz", { patient: false })).rejects.toBeInstanceOf(RateLimited);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits longer after each 429, then stops waiting once the host has blocked us", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(tooMany);
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
      const client = store("exito", "group-b");

      const first = client.search("arroz").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(59_000);
      expect(fetchMock).toHaveBeenCalledTimes(1); // still in the first 1 min cool-down
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      expect(await first).toBeInstanceOf(Error);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const second = client.search("leche").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(13 * 60_000); // the 4 and 8 min cool-downs
      expect(await second).toBeInstanceOf(RateLimited);
      expect(fetchMock).toHaveBeenCalledTimes(5);

      // Blocked: the next term fails at once, without asking the store, until the 15 min cool-down ends.
      await expect(client.search("huevos")).rejects.toBeInstanceOf(RateLimited);
      expect(fetchMock).toHaveBeenCalledTimes(5);
      await vi.advanceTimersByTimeAsync(15 * 60_000);
      await expect(client.search("huevos")).rejects.toBeInstanceOf(RateLimited);
      expect(fetchMock).toHaveBeenCalledTimes(6); // one probe, then blocked again
    } finally {
      vi.useRealTimers();
    }
  });
});
