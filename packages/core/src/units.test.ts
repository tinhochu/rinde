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
    // "x2.5kg" is one 2.5 kg bag, not two
    ["Arroz Casanare blanco x2.5kg", 2500, "g"],
    // "10" is the brand ("Arroz 10"), not a pack count; the x belongs to the size
    ["Arroz Roa 10 x2.5kg", 2500, "g"],
    ["Galletas 6x30g", 180, "g"],
    ["Leche Alpina x6 1100 ml", 6600, "ml"],
    // Colombian thousands separator on g / ml
    ["Arroz Integral Diana 1.000 G", 1000, "g"],
    ["Aceite Vegetal Imatá 3.000 Ml", 3000, "ml"],
    ["Gaseosa Manzana Postobon 1.750 Ml", 1750, "ml"],
    ["Arroz 2.500 kg", 2500, "g"],
    // Éxito and Carulla: the trailing "(… gr)" is the whole pack, not one of the "x30und"
    ["Salchicha de pollo RICA x30und (500  gr)", 500, "g"],
    ["Galletas SALTIN NOEL tradicional x4 tacos (354  gr)", 354, "g"],
    ["Agua con gas H2O saborizada surtido x6und (3600  ml)", 3600, "ml"],
    ["Leche entera ALPINA caja x4und 1l (4000  ml)", 4000, "ml"],
    ["Café  JUAN VALDEZ liofilizado sticks x30und (45  gr)", 45, "g"],
    ["Yogurt griego ZORBA sin dulce (953.289  ml)", 953.289, "ml"],
    ["Suavizante SUAVITEL frescura de manzana (2.3  lt)", 2300, "ml"],
    ["Atún CARULLA lomitos en agua (110.5  gr)", 110.5, "g"],
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
