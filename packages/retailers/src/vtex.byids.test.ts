import { afterEach, describe, expect, it, vi } from "vitest";
import { createVtexClient } from "./vtex";

const product = (itemId: string) => ({
  productId: `p${itemId}`,
  productName: `Producto ${itemId} 500 g`,
  linkText: `producto-${itemId}`,
  items: [{ itemId, ean: `77${itemId}`, sellers: [{ commertialOffer: { Price: 1000, IsAvailable: true, AvailableQuantity: 5 } }] }],
});

describe("byIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RETAILER_MIN_INTERVAL_MS"];
  });

  it("batches SKUs into repeated fq=skuId params, 30 per request", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const ids = [...new URL(url).searchParams.getAll("fq")].map((f) => f.replace("skuId:", ""));
      return { ok: true, status: 200, text: async () => JSON.stringify(ids.map(product)) };
    }) as unknown as typeof fetch);

    const client = createVtexClient({ slug: "d1", name: "D1", baseUrl: "https://www.d1.com.co", searchPath: "/api/catalog_system/pub/products/search" });
    const ids = Array.from({ length: 31 }, (_, i) => String(i + 1));
    const offers = await client.byIds([...ids, "1"]);

    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]!).searchParams.getAll("fq")).toHaveLength(30);
    expect(offers.map((o) => o.externalId).sort()).toEqual([...ids].sort());
    expect(offers[0]?.stock).toBe(5);
  });
});
