import { afterEach, describe, expect, it, vi } from "vitest";
import carullaSearch from "./__fixtures__/carulla-search.json";
import { carulla, enabledStores } from "./index";

describe("carulla client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RETAILER_MIN_INTERVAL_MS"];
  });

  it("reads a recorded Carulla search: name, EAN, size and the store's own price", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 206, text: async () => JSON.stringify(carullaSearch) };
    }) as unknown as typeof fetch);

    const offers = await carulla.search("leche", { limit: 3 });

    expect(urls[0]).toMatch(/^https:\/\/www\.carulla\.com\/io\/api\/catalog_system\/pub\/products\/search\?ft=leche/);
    expect(offers[0]).toMatchObject({
      retailer: "carulla",
      name: "Leche COLANTA semidescremada (1100  ml)",
      ean: "7702129006132",
      size: { amount: 1100, unit: "ml" },
      price: 6100,
      available: true,
      source: "carulla:vtex-catalog",
    });
    expect(offers[0]?.sourceUrl).toBe(urls[0]);
    // Only a marketplace seller sells this one: not a Carulla price.
    expect(offers[2]).toMatchObject({ name: "Recolector De Leche Materna", price: 0, available: false });
  });
});

describe("enabledStores", () => {
  it("always includes D1, Jumbo and Carulla; Éxito only with INGEST_EXITO=1", () => {
    expect(enabledStores({})).toEqual(["d1", "jumbo", "carulla"]);
    expect(enabledStores({ INGEST_EXITO: "0" })).toEqual(["d1", "jumbo", "carulla"]);
    expect(enabledStores({ INGEST_EXITO: "1" })).toEqual(["d1", "jumbo", "exito", "carulla"]);
  });
});
