import { describe, expect, it } from "vitest";
import { candidatesFor, normBrand, packCount, pickSameProduct, sameProduct, varietyTokens, type MatchItem } from "./match";

let n = 0;
const item = (name: string, brand: string | null, aisle: string | null = "dairy"): MatchItem => ({ id: `l${n++}`, name, brand, aisle });

describe("normBrand", () => {
  it("ignores case, accents and corporate suffixes", () => {
    expect(normBrand("ALPINA S.A.")).toBe("alpina");
    expect(normBrand("Alquería")).toBe("alqueria");
    expect(normBrand(null)).toBe("");
  });
});

describe("packCount", () => {
  it.each([
    ["Leche Colanta 6 x 200 ml", 6],
    ["Leche Colanta Semidescremada 6Und 900ml", 6],
    ["Gaseosa Postobón x6 400 ml", 6],
    ["Leche entera ALPINA (1100  ml)", 1],
    ["Huevo AA Kikes 30 Und", 1],
  ])("%s → %d", (name, count) => expect(packCount(name)).toBe(count));
});

describe("varietyTokens", () => {
  it("keeps what tells varieties apart and drops brand, size and store wording", () => {
    expect([...varietyTokens({ name: "Leche Deslactosada Bolsa UHT Latti 900 Ml", brand: "Latti" })].sort()).toEqual(["deslactosada", "leche", "uht"]);
    expect([...varietyTokens({ name: "Leche Entera Tetra Pak Latti 900 Ml", brand: "Latti" })].sort()).toEqual(["entera", "leche"]);
  });
});

describe("candidatesFor", () => {
  const target = item("Leche deslactosada Alpina x1L", "ALPINA");

  it("keeps the same size after converting units, and the same brand", () => {
    const same = item("Leche Deslact. ALPINA 1000 ml", "Alpina");
    const other = [
      item("Leche deslactosada Alpina 900 ml", "Alpina"), // 900 ml vs 1 L: not a candidate
      item("Leche deslactosada Colanta 1000 ml", "Colanta"), // another brand
      item("Leche deslactosada Alpina 6 x 1000 ml", "Alpina"), // six-pack vs single
      item("Queso Alpina 1000 g", "Alpina", "dairy"), // grams vs millilitres
    ];
    expect(candidatesFor(target, [...other, same])).toEqual([same]);
  });

  it("keeps a candidate with no brand, and leaves out other aisles", () => {
    const unbranded = item("Leche deslactosada 1000 ml", null);
    const elsewhere = item("Leche deslactosada Alpina 1 L", "Alpina", "cleaning");
    expect(candidatesFor(target, [elsewhere, unbranded])).toEqual([unbranded]);
  });

  it("puts listings sharing more name words first, at most 8", () => {
    const close = item("Leche Deslactosada ALPINA 1000ml", "Alpina");
    const far = item("Bebida Láctea Alpina 1000 ml", "Alpina");
    expect(candidatesFor(target, [far, close])).toEqual([close, far]);
    const many = Array.from({ length: 12 }, () => item("Leche Alpina 1 L", "Alpina"));
    expect(candidatesFor(target, many)).toHaveLength(8);
  });
});

describe("sameProduct (strict rule without Muse)", () => {
  it("matches the same brand, size and variety under other store wording", () => {
    expect(sameProduct(item("Leche Alquería Original 1000ml", "Alqueria"), item("Leche Original Bolsa ALQUERIA 1 L", "ALQUERÍA S.A."))).toBe(true);
    expect(sameProduct(item("Arroz Diana 500 G", "Diana", "pantry"), item("Arroz DIANA (500  gr)", "DIANA", "pantry"))).toBe(true);
  });

  it("tells entera from deslactosada", () => {
    expect(sameProduct(item("Leche entera Alpina 1 L", "Alpina"), item("Leche deslactosada Alpina 1 L", "Alpina"))).toBe(false);
  });

  it("never matches 900 ml with 1 L, or a six-pack with a single", () => {
    expect(sameProduct(item("Leche entera Alpina 1 L", "Alpina"), item("Leche entera Alpina 900 ml", "Alpina"))).toBe(false);
    expect(sameProduct(item("Leche entera Alpina 1 L", "Alpina"), item("Leche entera Alpina 6 x 1 L", "Alpina"))).toBe(false);
  });

  it("never matches without a brand on both sides", () => {
    expect(sameProduct(item("Leche entera 1 L", null), item("Leche entera 1 L", null))).toBe(false);
    expect(sameProduct(item("Leche entera Alpina 1 L", "Alpina"), item("Leche entera Alpina 1 L", null))).toBe(false);
  });

  it("does not match a store's own name for a different variety", () => {
    expect(sameProduct(item("Leche semidescremada Alpina 1100 ml", "Alpina"), item("Leche 2.0 Alpina 1100 ml", "Alpina"))).toBe(false);
  });
});

describe("pickSameProduct", () => {
  const target = item("Leche Colanta Semidescremada 6Und 900ml", "Colanta");

  it("picks the one listing that passes", () => {
    const hit = item("Leche Semidescremada COLANTA 6 und 900 ml", "COLANTA");
    expect(pickSameProduct(target, [item("Leche COLANTA semidescremada (1100  ml)", "COLANTA"), hit])).toBe(hit);
  });

  it("picks none when two pass", () => {
    const a = item("Leche Semidescremada COLANTA 6 und 900 ml", "COLANTA");
    const b = item("Leche Colanta Semidescremada Bolsa 6Und 900ml", "Colanta");
    expect(pickSameProduct(target, [a, b])).toBeNull();
  });
});
