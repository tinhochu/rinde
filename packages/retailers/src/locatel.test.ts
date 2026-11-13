import { afterEach, describe, expect, it, vi } from "vitest";
import locatelSearch from "./__fixtures__/locatel-search.json";
import { locatel } from "./index";

describe("locatel client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RETAILER_MIN_INTERVAL_MS"];
  });

  it("reads a recorded Locatel search: name, EAN, size and Locatel's own price", async () => {
    process.env["RETAILER_MIN_INTERVAL_MS"] = "0";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 206, text: async () => JSON.stringify(locatelSearch) };
    }) as unknown as typeof fetch);

    const offers = await locatel.search("leche deslactosada", { limit: 3 });

    expect(urls[0]).toMatch(/^https:\/\/www\.locatelcolombia\.com\/api\/catalog_system\/pub\/products\/search\?ft=leche/);
    expect(offers[0]).toMatchObject({
      retailer: "locatel",
      name: "Leche Alpina Deslactosada X 200Ml",
      ean: "7702001044481",
      size: { amount: 200, unit: "ml" },
      price: 2450,
      available: true,
      source: "locatel:vtex-catalog",
    });
    expect(offers[0]?.url).toMatch(/^https:\/\/www\.locatelcolombia\.com\/.+\/p$/);
  });
});
