import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL, routeOptions, type Branch, type Candidate, type PlanItem, type RetailerSlug, type TravelMode } from "@rinde/core";
import { adviseRoute } from "./route-advice";

// Opt-in: calls the real Meta Model API. `MUSE_LIVE=1 npx vitest run src/server/route-advice.live.test.ts`
let seq = 0;
const cand = (retailer: RetailerSlug, price: number, name: string): Candidate => ({
  listingId: `${retailer}-${++seq}`, retailer, name, brand: null, price, size: { amount: 1, unit: "unit" },
  url: "https://example.com", source: "test", observedAt: "2026-10-28T10:00:00.000Z", priceStatus: "snapshot", isLiteralMatch: true, isSubstitute: false,
});
const item = (label: string, d1: number, carulla: number): PlanItem => ({
  id: label, label, quantity: 1, unit: "unit", essential: true, allowSubstitute: true,
  candidates: [cand("d1", d1, label), cand("carulla", carulla, label)],
});
const D1: Branch = { id: "d1", chain: "d1", name: "D1 Calle 63", address: null, area: "Chapinero, Bogotá", lat: 4.65, lon: -74.066 };
const CARULLA: Branch = { id: "ca", chain: "carulla", name: "Carulla Calle 63", address: null, area: "Chapinero, Bogotá", lat: 4.6552, lon: -74.0597 };

async function scenario(mode: TravelMode, saving: number, loop: { distanceM: number; durationS: number }) {
  const items = [
    item("Aceite de girasol 3 L", 30_000, 30_000 - saving),
    item("Leche entera", 4_500, 5_200),
    item("Arveja congelada", 6_000, 7_000),
    item("Pan tajado", 44_000, 46_000),
  ];
  const { options } = await routeOptions({
    items, anchor: { chain: "d1", point: [D1.lat, D1.lon], branch: D1 }, start: null, branches: [CARULLA],
    retailers: ["d1", "carulla"], travel: { mode, ...DEFAULT_TRAVEL }, budget: 500_000,
    provider: { route: async () => ({ ...loop, coordinates: [], legs: [] }), table: async () => ({ durationsS: [[loop.durationS / 2]] }) },
  });
  return options;
}

describe.skipIf(!process.env["MUSE_LIVE"])("adviseRoute against Muse (live)", () => {
  it("worth it on foot: a store next door saving $12.300", async () => {
    const advice = await adviseRoute(await scenario("walk", 12_300, { distanceM: 600, durationS: 480 }), { mode: "walk" }, "", { allowQuestion: false });
    console.log("[live] next door:", advice.source, advice.choice, advice.explanation, JSON.stringify([...advice.itemOrder]));
    expect(advice.source).toBe("muse");
    expect(advice.choice).toBe(1);
  }, 60_000);

  it("with a baby, on foot, for $4.000", async () => {
    const advice = await adviseRoute(await scenario("walk", 4_000, { distanceM: 900, durationS: 720 }), { mode: "walk" }, "voy con bebé y llevo el mercado a pie", { allowQuestion: false });
    console.log("[live] baby:", advice.source, advice.choice, advice.explanation);
    expect(advice.source).toBe("muse");
  }, 60_000);

  it("a far store by car, where the trip eats the saving", async () => {
    const advice = await adviseRoute(await scenario("car", 6_000, { distanceM: 4200, durationS: 1080 }), { mode: "car" }, "", { allowQuestion: false });
    console.log("[live] far by car:", advice.source, advice.choice, advice.explanation);
    expect(advice.source).toBe("muse");
    expect(advice.choice).toBe(0);
  }, 60_000);
});
