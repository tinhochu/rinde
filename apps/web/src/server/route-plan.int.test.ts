import { describe, expect, it, vi } from "vitest";
import type { Branch, Candidate, PlanItem, RetailerSlug } from "@rinde/core";
import { db } from "@rinde/db";
import type { LatLon, Route, RouteProvider } from "@rinde/routing";
import { adviseRoute } from "./route-advice";
import { routePlanSchema, runRoutePlan, type RoutePlanDeps, type RoutePlanEvent } from "./route-plan";

let seq = 0;
const cand = (retailer: RetailerSlug, price: number, name: string): Candidate => ({
  listingId: `${retailer}-${++seq}`, retailer, name, brand: null, price, size: { amount: 1, unit: "unit" },
  url: "https://example.com", source: "test", observedAt: new Date().toISOString(), priceStatus: "snapshot", isLiteralMatch: true, isSubstitute: false,
});
const item = (label: string, d1: number, carulla: number): PlanItem => ({
  id: label, label, quantity: 1, unit: "unit", essential: true, allowSubstitute: true,
  candidates: [cand("d1", d1, `${label} D1`), cand("carulla", carulla, `${label} Carulla`)],
});
const ITEMS = [item("Arroz", 20_000, 7_700), item("Leche entera", 4_500, 5_200), item("Pan tajado", 6_000, 7_000)];

const D1: Branch = { id: "b-d1", chain: "d1", name: "D1 Calle 63", address: "Calle 63 # 9", area: "Chapinero, Bogotá", lat: 4.65, lon: -74.066 };
const CARULLA: Branch = { id: "b-ca", chain: "carulla", name: "Carulla Calle 63", address: null, area: "Chapinero, Bogotá", lat: 4.6552, lon: -74.0597 };
const HOME = { lat: 4.6481234, lon: -74.0641234 };

const step = (type: string, name: string, distanceM: number) => ({ type, modifier: type === "turn" ? "right" : null, name, exit: null, distanceM, durationS: distanceM });
const routeThrough = (points: LatLon[]): Route => ({
  distanceM: 400 * (points.length - 1), durationS: 300 * (points.length - 1),
  coordinates: points,
  legs: points.slice(1).map(() => ({ distanceM: 400, durationS: 300, steps: [step("depart", "Calle 63", 100), step("turn", "Carrera 9", 300), step("arrive", "", 0)] })),
});

function deps(extra: Partial<RoutePlanDeps> = {}) {
  const routed: LatLon[][] = [];
  const provider: RouteProvider = {
    route: vi.fn(async (points: LatLon[]) => { routed.push(points); return routeThrough(points); }),
    table: vi.fn(async (_s: LatLon[], d: LatLon[]) => ({ durationsS: [d.map(() => 240)], distancesM: [d.map(() => 300)] })),
  };
  const d: RoutePlanDeps = {
    provider,
    branches: async () => [D1, CARULLA],
    geocode: vi.fn(async () => [4.6500123, -74.0660123] as LatLon),
    // Live checks: Carulla's arroz went up $500 since the snapshot.
    verify: {
      fetchLive: async (_r, ids) => new Map(ids.map((id) => {
        const c = ITEMS.flatMap((i) => i.candidates).find((x) => x.listingId === id)!;
        return [id, { price: c.name === "Arroz Carulla" ? c.price + 500 : c.price, observedAt: new Date().toISOString(), observationId: `obs-${id}` }];
      })),
    },
    advise: (options, travel, note, opts) => adviseRoute(options, travel, note, opts, { apiKey: undefined, baseUrl: "", model: "", timeoutMs: 1, fetch }),
    items: async () => ({ items: ITEMS, budget: 200_000, retailers: ["d1", "carulla"] }),
    ...extra,
  };
  return { d, routed };
}

async function run(body: unknown, d: RoutePlanDeps) {
  const events: RoutePlanEvent[] = [];
  await runRoutePlan(routePlanSchema.parse(body), (e) => events.push(e), d);
  return events;
}

describe.skipIf(!process.env["INTEGRATION"])("route plan (dev DB untouched)", () => {
  it("streams options with routes, then advice, then live-checked totals, and stores nothing", async () => {
    const before = await Promise.all([db().shoppingList.count(), db().storeBranch.count(), db().optimizedBasket.count()]);
    const { d, routed } = deps();
    const events = await run({ listId: "x", anchor: { branchId: "b-d1" }, start: HOME, travel: { mode: "walk" }, note: "voy a pie" }, d);
    expect(events.map((e) => e.type)).toEqual(["options", "advice", "verified"]);

    const options = events[0]!.type === "options" ? events[0]!.options : [];
    expect(options.map((o) => o.label)).toEqual(["Solo en tu D1", "D1 + Carulla"]);
    expect(options[1]).toMatchObject({ saving: 12_300, travelCost: 0, net: 12_300 });
    expect(options[1]!.route!.legs.map((l) => l.to)).toEqual(options[1]!.stops.map((s) => s.name));
    expect(options[1]!.route!.legs[0]!.steps).toEqual(["Sal por la Calle 63 · 100 m", "Gira a la derecha en la Carrera 9 · 300 m", `Llegas a ${options[1]!.stops[0]!.name}`]);
    // Routed from the person's location rounded to ~100 m, never the exact one.
    expect(routed.every((ps) => ps[0]![0] === 4.648 && ps[0]![1] === -74.064)).toBe(true);
    expect(options[1]!.route!.from).toEqual([4.648, -74.064]);

    expect(events[1]).toMatchObject({ type: "advice", choice: 1, source: "rule" });
    expect(events[2]).toMatchObject({ type: "verified", choice: 1, saving: 11_800, net: 11_800, checked: 3 });
    expect(await Promise.all([db().shoppingList.count(), db().storeBranch.count(), db().optimizedBasket.count()])).toEqual(before);
  });

  it("asks Muse's question, and doesn't let it ask again once answered", async () => {
    const question = vi.fn(async (o: Parameters<typeof adviseRoute>[0], _t: unknown, note: string, opts?: { allowQuestion?: boolean }) => ({
      source: "rule" as const, choice: 1, explanation: "x", question: opts?.allowQuestion ? "¿Vas con carro?" : null,
      itemOrder: new Map<number, string[]>(), foregone: null, note,
    }));
    const { d } = deps({ advise: question as unknown as RoutePlanDeps["advise"] });
    const first = await run({ listId: "x", anchor: { branchId: "b-d1" }, travel: { mode: "walk" } }, d);
    expect(first.map((e) => e.type)).toEqual(["options", "question", "verified"]);
    const second = await run({ listId: "x", anchor: { branchId: "b-d1" }, travel: { mode: "walk" }, answer: "No" }, d);
    expect(second.map((e) => e.type)).toEqual(["options", "advice", "verified"]);
    expect(question.mock.calls[1]![2]).toBe("Respuesta: No");
  });

  it("takes a typed address as the anchor, geocoded and rounded", async () => {
    const { d, routed } = deps();
    const events = await run({ listId: "x", anchor: { chain: "d1", address: "Calle 63 # 9-20, Bogotá" }, travel: { mode: "walk" } }, d);
    expect(d.geocode).toHaveBeenCalledWith("Calle 63 # 9-20, Bogotá");
    expect(routed[0]![0]).toEqual([4.65, -74.066]);
    expect(events[0]!.type === "options" && events[0]!.options[0]!.stops[0]!.name).toBe("Tu D1");
  });

  it("says when the route to a store couldn't be calculated", async () => {
    const { d } = deps();
    d.provider.route = async () => { throw new Error("down"); };
    const events = await run({ listId: "x", anchor: { branchId: "b-d1" }, travel: { mode: "walk" } }, d);
    expect(events[0]).toMatchObject({ type: "options", leftOut: [{ chain: "carulla", reason: "No pudimos calcular la ruta a Carulla" }] });
  });
});
