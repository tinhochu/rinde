import { describe, expect, it } from "vitest";
import { eggKey, eggOf } from "./eggs";

const egg = (name: string, size: string | null = null, unit: "g" | "unit" | null = "unit", category = "Huevos") => eggOf({ name, size, unit, category });

describe("eggOf", () => {
  it("reads grade and count from each store's naming", () => {
    expect(egg("Huevos AA rojos Nápoles x30und", "30.000")).toEqual({ grade: "AA", count: 30 });
    expect(egg("Huevo Tipo Aa Sol Naciente 12 Und", "12.000")).toEqual({ grade: "AA", count: 12 });
    expect(egg("Huevos A AVINAL rojo (6  und)", "6.000")).toEqual({ grade: "A", count: 6 });
    expect(egg("Huevos Cuisine&Co AAA rojo x15und", "15.000")).toEqual({ grade: "AAA", count: 15 });
    expect(egg("Huevos Oro Plus Aaa X30 Unidades", "30.000")).toEqual({ grade: "AAA", count: 30 });
    expect(egg("Huevo Tipo B 30 Und", "30.000")).toEqual({ grade: "B", count: 30 });
    expect(egg("Huevos Kikes rojos tipo L x12und", "12.000")).toEqual({ grade: "L", count: 12 });
    expect(egg("Huevo de Codorniz Sol Naciente 24 Und", "24.000")).toEqual({ grade: "codorniz", count: 24 });
  });

  it("ignores brand and shell color, so the same grade and count share a key", () => {
    const keys = ["Huevos A rojos Santa Reyes x30und", "Huevos A rojos San Pio x30und", "Huevo Tipo A Sol Naciente 30 Und", "Huevos A SMN rojo (30  und)"]
      .map((n) => eggKey(egg(n, "30.000")!));
    expect(new Set(keys)).toEqual(new Set(["egg:A:30"]));
    expect(eggKey(egg("Huevos AA blancos Santa Reyes x12und", "12.000")!)).toBe(eggKey(egg("Huevos AA rojos Vigor x12und", "12.000")!));
  });

  it("trusts the count in the name over a size filed in grams", () => {
    expect(egg("Huevo H Tipo A Sol Naciente X 30 Und", "1590.000", "g")).toEqual({ grade: "A", count: 30 });
  });

  it("keeps ambiguous, ungraded and specialty eggs out", () => {
    expect(egg("Huevos A - AA rojos Bonegg x21und", "21.000")).toBeUndefined();
    expect(egg("Huevos SRY Jumbo AA rojos x45und", "45.000")).toBeUndefined();
    expect(egg("Huevos San Pio x30und", "30.000")).toBeUndefined();
    expect(egg("Huevos Ecoterra Gallinas Libre Pastoreo 10Und", "10.000")).toBeUndefined();
    expect(egg("Huevos Oro Dha X12 Unidades", "12.000")).toBeUndefined();
    expect(egg("Huevos Azules Gallina Feliz Blü x18 unidades", "18.000")).toBeUndefined();
  });

  it("is only about cartons of eggs", () => {
    expect(egg("Huevos de chocolate KINDER joy chocolate (240  gr)", "240.000", "g", "Chocolatería")).toBeUndefined();
    expect(egg("Organizador De Huevos Caja Para 32 Unidades", "32.000", "unit", "Cajas y canastas organizadoras")).toBeUndefined();
    expect(egg("Arepa de huevo K-Listo x4und x600g", "2400.000", "g", "Masas Y Snacks")).toBeUndefined();
  });
});
