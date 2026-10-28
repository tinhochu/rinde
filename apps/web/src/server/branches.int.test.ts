import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";
import type { LatLon, RouteProvider } from "@rinde/routing";
import { branchQuerySchema, findBranches } from "./branches";

const RUN = `test-branch-${Date.now()}`;
// Made-up branches around a made-up spot, so the dev DB's real ones don't interfere: far east of Colombia.
const HERE: LatLon = [4.5, -67.5];
const SEED = [
  { osmId: `${RUN}/1`, chain: "d1" as const, name: "D1 Zqxwv Norte", area: "Zqxwv Alto, Bogotá", lat: 4.501, lon: -67.5 },
  { osmId: `${RUN}/2`, chain: "d1" as const, name: "D1 Zqxwv Sur", area: "Zqxwv Bajo, Bogotá", lat: 4.4995, lon: -67.5 },
  { osmId: `${RUN}/3`, chain: "carulla" as const, name: "Carulla Zqxwv", area: "Zqxwv Alto, Bogotá", lat: 4.502, lon: -67.501 },
];

// The router says the farther D1 (straight line) is quicker by street.
const provider: RouteProvider = {
  route: async () => { throw new Error("not used"); },
  table: async (_s, destinations) => ({
    durationsS: [destinations.map(([lat]) => (lat === 4.501 ? 120 : lat === 4.4995 ? 400 : 300))],
    distancesM: [destinations.map(([lat]) => (lat === 4.501 ? 150 : lat === 4.4995 ? 520 : 380))],
  }),
};

describe.skipIf(!process.env["INTEGRATION"])("branches (dev DB)", () => {
  beforeAll(async () => {
    await db().storeBranch.createMany({ data: SEED.map((b) => ({ ...b, address: null, refreshedAt: new Date() })) });
  });
  afterAll(async () => {
    await db().storeBranch.deleteMany({ where: { osmId: { startsWith: RUN } } });
  });

  it("near a point: ordered by route time, with route distance and minutes", async () => {
    const query = branchQuerySchema.parse({ near: HERE.join(","), chain: "d1" });
    const { branches, routed } = await findBranches(query, { provider });
    expect(routed).toBe(true);
    const mine = branches.filter((b) => b.name.includes("Zqxwv"));
    expect(mine.map((b) => [b.name, b.distanceM, b.durationS])).toEqual([["D1 Zqxwv Norte", 150, 120], ["D1 Zqxwv Sur", 520, 400]]);
  });

  it("by name and neighborhood, without location", async () => {
    const { branches } = await findBranches(branchQuerySchema.parse({ q: "d1 zqxwv alto" }));
    expect(branches.map((b) => b.name)).toEqual(["D1 Zqxwv Norte"]);
    const { branches: any } = await findBranches(branchQuerySchema.parse({ q: "Zqxwv" }));
    expect(any.map((b) => b.name)).toEqual(["Carulla Zqxwv", "D1 Zqxwv Norte", "D1 Zqxwv Sur"]);
  });

  it("rounds the person's location to about 100 m", () => {
    const query = branchQuerySchema.parse({ near: "4.6512345,-74.0598765" });
    expect("near" in query && query.near).toEqual([4.651, -74.06]);
  });

  it("lists nearest-first without distances when routing is down", async () => {
    const down: RouteProvider = { ...provider, table: async () => { throw new Error("down"); } };
    const { branches, routed } = await findBranches(branchQuerySchema.parse({ near: HERE.join(","), chain: "d1" }), { provider: down });
    expect(routed).toBe(false);
    expect(branches.filter((b) => b.name.includes("Zqxwv")).every((b) => b.distanceM === undefined)).toBe(true);
  });
});
