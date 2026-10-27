import { describe, expect, it } from "vitest";
import { isRelevant } from "./relevance";

const listing = (name: string, brand: string | null = null, category: string | null = null) => ({ name, brand, category });

// Listings the planner picked for a 15-item family list on 2026-10-26 (docs/demo-plan-baseline.md).
describe("isRelevant", () => {
  it.each([
    ["Arroz", "Arroz Económico Albar 450 Grs"],
    ["Fríjol", "Fríjol Caraota el Estío 500 Gr"],
    ["Huevos", "Huevo Rojo AA x 30 Und"],
    ["Tomate", "Tomate Chonto x 1000 g"],
    ["Pasta", "Pasta spaghetti Pugliese x1000g"],
    ["Banano", "Banano Urabá x 500 gr"],
    ["Arroz", "Bolsa ARROZ SONORA PREMIUM blanco (1000  gr)"],
    ["Leche", "Alpina Leche Entera 1100 ml", "Alpina"],
    ["pasta de tomate", "Pasta de Tomate Zev 200 Grs"],
    ["Pasta", "Spaghetti Capríssima 250 G"],
    ["Pasta", "Macarrones Doria 250 g"],
  ] as [string, string, string?][])("%s → %s", (request, name, brand?: string) => {
    expect(isRelevant(listing(name, brand ?? null), request)).toBe(true);
  });

  it.each([
    ["Café", "Yogurt Colácteos café vaso x200g"],
    ["Banano", "Ponqué Banano/Zanahoria Natri 340 Grs"],
    ["Tomate", "Salsa de Tomate Zev 500 Grs"],
    ["Pasta", "Pasta de Tomate Zev 200 Grs"],
    ["Huevos", "Huevo de Codorniz Sol Naciente 24 Und"],
    ["Pasta", "Crema dental pasta de dientes"],
    ["Pasta", "Sopa de Fideos Maggi 60 g"],
    ["pasta de tomate", "Spaghetti Capríssima 250 G"],
    ["Papa", "Papas Pringles Queso X 40g"],
  ])("%s ✗ %s", (request, name) => {
    expect(isRelevant(listing(name), request)).toBe(false);
  });

  // Categories as D1 and Jumbo store them.
  it.each([
    ["Papa", "Papa Pareja 2500 G", "Hortalizas", true],
    ["Papa", "Papa Pastusa X 2500 G", "Fresco", true],
    ["Banano", "Banano Urabá x 500 gr", "Frutas", true],
    ["Papa", "Papas Pringles Queso X 40g", "Papas Fritas Y Paquetes", false],
    ["Papa", "Papa Airfryer Mccain X 500 G", "Congelados", false],
  ] as const)("produce: %s · %s (%s) → %s", (request, name, category, expected) => {
    expect(isRelevant(listing(name, null, category), request)).toBe(expected);
  });
});
