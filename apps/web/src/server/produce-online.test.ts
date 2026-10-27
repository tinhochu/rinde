import { describe, expect, it } from "vitest";
import { missingStores, onlineProduceOf } from "./produce-online";

describe("onlineProduceOf", () => {
  it("canonicalizes 1kg fresh produce across stores' private codes", () => {
    // D1 and Jumbo code the same plátano differently; the 1kg pack is the same thing.
    expect(onlineProduceOf({ name: "Plátano X 1000 G", size: "1000.000", unit: "g", category: "Frutas y verduras" }))
      .toEqual({ slug: "platano", per: "kg" });
    expect(onlineProduceOf({ name: "Plátano verde", size: "1000.000", unit: "g", category: "Frutas y Verduras" }))
      .toEqual({ slug: "platano", per: "kg" });
  });

  it("recognizes single-unit produce", () => {
    expect(onlineProduceOf({ name: "Piña oro miel x1 und", size: "1.000", unit: "unit", category: "Frutas y verduras" }))
      .toEqual({ slug: "pina", per: "unit" });
    expect(onlineProduceOf({ name: "Plátano jumbo x1 un", size: "1.000", unit: "unit", category: null }))
      .toEqual({ slug: "platano", per: "unit" });
  });

  it("leaves other pack sizes alone so shelf prices compare like with like", () => {
    expect(onlineProduceOf({ name: "Plátano Maduro x 500gr", size: "500.000", unit: "g", category: "Frutas y verduras" })).toBeUndefined();
    expect(onlineProduceOf({ name: "Plátano x2000gr", size: "2000.000", unit: "g", category: null })).toBeUndefined();
    expect(onlineProduceOf({ name: "Plátano verde a $3.000", size: null, unit: null, category: "Frutas y verduras" })).toBeUndefined();
    expect(onlineProduceOf({ name: "Platano Vitad verde x100g", size: "100.000", unit: "g", category: "Frutas y verduras" })).toBeUndefined();
  });

  it("rejects processed foods that merely mention produce", () => {
    expect(onlineProduceOf({ name: "Moneditas de Plátano Plataitos 6 X 50 Gr", size: "300.000", unit: "g", category: "Pasabocas" })).toBeUndefined();
    expect(onlineProduceOf({ name: "Arepas de queso DON MAIZ de plátano rellena de queso x4und", size: "1120.000", unit: "g", category: "Panadería" })).toBeUndefined();
    expect(onlineProduceOf({ name: "Colada PAMPA harina de plátano (500 gr)", size: "500.000", unit: "g", category: "Despensa" })).toBeUndefined();
    expect(onlineProduceOf({ name: "Tajadas de Plátano giants 300g", size: "1000.000", unit: "g", category: "Congelados" })).toBeUndefined();
  });

  it("rejects produce-named listings outside the produce aisle", () => {
    expect(onlineProduceOf({ name: "Tomate frito enlatado x1000g", size: "1000.000", unit: "g", category: "Enlatados y conservas" })).toBeUndefined();
  });
});

describe("missingStores", () => {
  const offer = (store: "D1" | "Jumbo", aisle: "produce" | "dairy" = "dairy") => ({ store, aisle }) as never;

  it("names checked stores without the barcode", () => {
    expect(missingStores(true, "dairy", ["d1", "jumbo"], [offer("D1")])).toEqual(["Jumbo"]);
    expect(missingStores(true, "dairy", ["d1", "jumbo"], [offer("D1"), offer("Jumbo")])).toEqual([]);
  });

  it("stays unknown without a barcode match", () => {
    expect(missingStores(false, "dairy", ["d1", "jumbo"], [offer("D1")])).toEqual([]);
  });

  it("stays unknown for fresh produce, where each chain codes the same thing privately", () => {
    expect(missingStores(true, "produce", ["d1", "jumbo"], [offer("D1", "produce")])).toEqual([]);
  });
});
