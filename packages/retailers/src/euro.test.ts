import { afterEach, describe, expect, it, vi } from "vitest";
import euroSearch from "./__fixtures__/euro-search.json";
import { euro } from "./index";

describe("euro client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RETAILER_MIN_INTERVAL_MS"];
  });

  it("reads a recorded Euro search: name, EAN, size and Euro's own price", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 206, text: async () => JSON.stringify(euroSearch) };
    }) as unknown as typeof fetch);

    const offers = await euro.search("leche deslactosada", { limit: 3 });

    expect(urls[0]).toMatch(/^https:\/\/www\.eurosupermercados\.com\.co\/api\/catalog_system\/pub\/products\/search\?ft=leche/);
    expect(offers[0]).toMatchObject({
      retailer: "euro",
      name: "LECHE DESLACTOSADA CODELAC *1100ML",
      ean: "7707727655065",
      size: { amount: 1100, unit: "ml" },
      price: 5350,
      available: true,
      source: "euro:vtex-catalog",
    });
    expect(offers[0]?.url).toMatch(/^https:\/\/www\.eurosupermercados\.com\.co\/.+\/p$/);
  });
});
