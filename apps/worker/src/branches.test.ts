import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaFrom, branchesFromOverpass, streetFrom } from "./branches";

// Recorded from Overpass on 2026-10-28 (© OpenStreetMap contributors, ODbL), trimmed to the tags read.
const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/overpass-branches.json", import.meta.url), "utf8"));

describe("branchesFromOverpass", () => {
  const branches = branchesFromOverpass(fixture);

  it("maps every brand spelling to its chain", () => {
    expect(branches.map((b) => b.chain)).toEqual(["exito", "d1", "d1", "carulla", "jumbo", "exito"]);
  });

  it("names a branch by its branch tag, and keeps a plain chain name otherwise", () => {
    expect(branches[0]).toMatchObject({ name: "Éxito Calle 80", address: "Avenida Calle 80 # Carrera 68, Bogotá", osmId: "way/24084290" });
    expect(branches[1]).toMatchObject({ name: "D1", address: null, osmId: "node/12545079911" });
    expect(branches[3]).toMatchObject({ name: "Carulla Laureles", address: "Circular 73B, Medellín" });
  });

  it("places ways and relations at their center", () => {
    expect(branches[0]).toMatchObject({ lat: 4.683959, lon: -74.0806089 });
    expect(branches[5]).toMatchObject({ lat: 9.3021664, lon: -75.3952203, osmId: "relation/2648895" });
  });

  it("counts a supermarket mapped only by the name Euro as Euro, but not other shops so named", () => {
    expect(branchesFromOverpass({ elements: [
      { type: "node", id: 1, lat: 6.2449, lon: -75.5958, tags: { shop: "supermarket", name: "Euro", "addr:city": "Medellín" } },
      { type: "node", id: 2, lat: 6.17, lon: -75.58, tags: { shop: "supermarket", brand: "Euro Supermercados", name: "Euro Envigado" } },
      { type: "node", id: 3, lat: 6.2, lon: -75.5, tags: { shop: "bakery", name: "Euro" } },
      { type: "node", id: 4, lat: 6.2, lon: -75.5, tags: { shop: "supermarket", name: "Euromarket" } },
    ] })).toMatchObject([
      { chain: "euro", name: "Euro", address: "Medellín", osmId: "node/1" },
      { chain: "euro", name: "Euro Envigado", osmId: "node/2" },
    ]);
  });

  it("skips other brands and elements without a position", () => {
    expect(branchesFromOverpass({ elements: [
      { type: "node", id: 1, lat: 4.6, lon: -74, tags: { brand: "Surtimax" } },
      { type: "way", id: 2, tags: { brand: "D1" } },
    ] })).toEqual([]);
  });
});

describe("areaFrom", () => {
  it("skips Bogotá's admin labels for the neighborhood and the city", () => {
    expect(areaFrom({ neighbourhood: "UPZs de Bogotá", suburb: "Localidad Chapinero", city: "Bogotá ciudad" })).toBe("Chapinero, Bogotá");
    expect(areaFrom({ neighbourhood: "Laureles", city: "Medellín" })).toBe("Laureles, Medellín");
    expect(areaFrom({ town: "Chía" })).toBe("Chía");
    expect(areaFrom({})).toBeNull();
  });
});

describe("streetFrom", () => {
  it("tells unaddressed branches apart by the street at their point", () => {
    expect(streetFrom({ road: "Calle 57", house_number: "9-30" })).toBe("Calle 57 # 9-30");
    expect(streetFrom({ road: "Avenida Carrera 15" })).toBe("Cerca de Avenida Carrera 15");
    expect(streetFrom({ suburb: "Chapinero" })).toBeNull();
  });
});
