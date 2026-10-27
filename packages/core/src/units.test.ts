import { describe, expect, it } from "vitest";
import { displayUnitPrice, packsNeeded, parsePackageSize } from "./units";

describe("parsePackageSize", () => {
  it.each([
    ["Arroz DIANA integral (1000  gr)", 1000, "g"],
    ["Arroz Roa x1kg", 1000, "g"],
    ["Lenteja el Estío 500 Grs", 500, "g"],
    ["Detergente Dersa Polvo Bicarbonato + Jabon Rey x500grs", 500, "g"],
    ["Gaseosa Kola Hipinto Postobon 1.5 Lt", 1500, "ml"],
    ["Coca Cola sin Azúcar 1750 Ml", 1750, "ml"],
    ["Leche entera FRESCAMPO larga vida (900  ml)", 900, "ml"],
    ["Huevo de Codorniz Sol Naciente 24 Und", 24, "unit"],
    ["Gansito Ramo 6 Und 222 G", 222, "g"],
    ["Avena Alpina Vaso 250 Ml", 250, "ml"],
    ["Aceite 1,5 L", 1500, "ml"],
    ["Leche Colanta 6 x 200 ml", 1200, "ml"],
    // Colombian thousands separator on g / ml
    ["Arroz Integral Diana 1.000 G", 1000, "g"],
    ["Aceite Vegetal Imatá 3.000 Ml", 3000, "ml"],
    ["Gaseosa Manzana Postobon 1.750 Ml", 1750, "ml"],
    ["Arroz 2.500 kg", 2500, "g"],
  ])("%s → %d %s", (name, amount, unit) => {
    expect(parsePackageSize(name)).toEqual({ amount, unit });
  });

  it("returns null when no size is present", () => {
    expect(parsePackageSize("Kit #3 Donación - Alimentos")).toBeNull();
  });

  it.each([
    "Yogurt RECREO sabor natural (1  gr)",
    "Gaseosa Soda Schweppes x 1.5 ml",
    "Pasta Tomate Rustica POMI 0.7  gr",
  ])("rejects an implausible size: %s", (name) => {
    expect(parsePackageSize(name)).toBeNull();
  });
});

describe("unit pricing", () => {
  it("compares 454 g vs 500 g on a per-kg basis", () => {
    expect(displayUnitPrice(2710, { amount: 454, unit: "g" })).toEqual({ value: 5969, per: "kg" });
    expect(displayUnitPrice(2550, { amount: 500, unit: "g" })).toEqual({ value: 5100, per: "kg" });
  });

  it("rounds packs up to cover the request", () => {
    expect(packsNeeded(1000, { amount: 454, unit: "g" })).toBe(3);
    expect(packsNeeded(1000, { amount: 500, unit: "g" })).toBe(2);
    expect(packsNeeded(100, { amount: 500, unit: "g" })).toBe(1);
  });
});
