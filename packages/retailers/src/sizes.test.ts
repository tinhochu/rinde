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

  it("falls back to the name when metadata is missing", () => {
    expect(resolvePackageSize(byName(jumbo, "Leche Alquería Original 1000ml"))).toEqual({ amount: 1000, unit: "ml" });
  });
});
