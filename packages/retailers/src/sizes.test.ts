import { describe, expect, it } from "vitest";
import d1 from "./__fixtures__/d1-search.json";
import jumbo from "./__fixtures__/jumbo-search.json";
import { resolvePackageSize, type VtexSizeSource } from "./sizes";

const byName = (list: VtexSizeSource[], name: string) => list.find((p) => p.productName === name)!;

describe("resolvePackageSize (real responses, 2026-10-26)", () => {
  it("reads D1's structured 'Unidad De Medida' / 'Valor de Medida'", () => {
    expect(resolvePackageSize(byName(d1, "Arroz Diana 500 G"))).toEqual({ amount: 500, unit: "g" });
  });

  it("reads Jumbo's unit_multiplier_un (kg/L) with g vs ml from the name", () => {
    expect(resolvePackageSize(byName(jumbo, "Arroz Roa x1kg"))).toEqual({ amount: 1000, unit: "g" });
    expect(resolvePackageSize(byName(jumbo, "Crema de Leche Alqueria 400g"))).toEqual({ amount: 400, unit: "g" });
  });

  it("uses Jumbo metadata for multipacks the name parser misses", () => {
    // Name alone yields 900 ml; Jumbo reports the 6 x 900 ml total
    expect(resolvePackageSize(byName(jumbo, "Leche Colanta Semidescremada 6Und 900ml"))).toEqual({ amount: 5400, unit: "ml" });
  });

  it("uses Jumbo metadata when the name has no size", () => {
    expect(resolvePackageSize(byName(jumbo, "Arroz Casanare Blanco"))).toEqual({ amount: 1000, unit: "g" });
  });

  it("reads a Jumbo listing sold by the piece as one unit", () => {
    // Recorded 2026-10-28: the same plantain sold by the kilo and by the piece.
    const data = (o: object) => [JSON.stringify(o)];
    expect(resolvePackageSize({ productName: "Plátano verde a $3.000", ProductData: data({ measurement_unit: "un", measurement_unit_un: "un", unit_multiplier_un: 0.001 }) }))
      .toEqual({ amount: 1, unit: "unit" });
    expect(resolvePackageSize({ productName: "Plátano  verde", ProductData: data({ measurement_unit: "kg", measurement_unit_un: "gr", unit_multiplier_un: 1 }) }))
      .toEqual({ amount: 1000, unit: "g" });
  });

  it("reads D1's '1.000' as a thousand grams, not one", () => {
    expect(resolvePackageSize({ productName: "Arroz Integral Diana 1.000 G", "Unidad De Medida": ["Gr"], "Valor de Medida": ["1.000"] }))
      .toEqual({ amount: 1000, unit: "g" });
  });

  it("drops a placeholder size instead of storing 1 g", () => {
    expect(resolvePackageSize({ productName: "Yogurt RECREO sabor natural (1  gr)" })).toBeNull();
  });

  it("falls back to the name when metadata is missing", () => {
    expect(resolvePackageSize(byName(jumbo, "Leche Alquería Original 1000ml"))).toEqual({ amount: 1000, unit: "ml" });
  });
});
