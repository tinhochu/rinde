import { describe, expect, it } from "vitest";
import { brandIn } from "./brands";

const brands = new Set(["alpina", "san fernando", "diana", "leche", "colanta"]);

describe("brandIn", () => {
  it("finds the brand a search names", () => {
    expect(brandIn("leche alpina", brands)).toBe("alpina");
    expect(brandIn("Leche ALPINA deslactosada", brands)).toBe("alpina");
    expect(brandIn("arroz Diana", brands)).toBe("diana");
  });

  it("prefers a two-word brand", () => {
    expect(brandIn("leche san fernando", brands)).toBe("san fernando");
  });

  it("finds none when the search names no brand", () => {
    expect(brandIn("leche", brands)).toBeNull();
    expect(brandIn("leche entera", brands)).toBeNull();
  });

  it("never takes a product word for a brand", () => {
    // "Leche" is also a label somewhere; the search is still about milk, not that brand.
    expect(brandIn("leche deslactosada", brands)).toBeNull();
  });
});
