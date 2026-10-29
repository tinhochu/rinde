import { describe, expect, it, vi } from "vitest";
import type { Candidate, PlanItem, RetailerSlug } from "./optimizer";
import { DEFAULT_TRAVEL, type TravelMode } from "./route-cost";
import { routeOptions, type Branch, type LatLon, type RouteLike, type RouteProviderLike } from "./route-options";

let seq = 0;
function cand(retailer: RetailerSlug, price: number): Candidate {
  seq++;
  return {
    listingId: `${retailer}-${seq}`, retailer, name: `Producto ${seq}`, brand: null, price, size: { amount: 1, unit: "unit" },
    url: "https://example.com", source: `${retailer}:vtex-catalog`, observedAt: "2026-10-28T10:00:00.000Z",
    priceStatus: "snapshot", isLiteralMatch: true, isSubstitute: false,
  };
}
const item = (id: string, candidates: Candidate[]): PlanItem => ({ id, label: id, quantity: 1, unit: "unit", essential: true, allowSubstitute: true, candidates });

const D1: Branch = { id: "b-d1", chain: "d1", name: "D1", address: "Calle 63 # 9", area: "Chapinero, Bogotá", lat: 4.6500, lon: -74.0660 };
const CARULLA: Branch = { id: "b-carulla", chain: "carulla", name: "Carulla Calle 63", address: null, area: "Chapinero, Bogotá", lat: 4.6552, lon: -74.0597 };
const FAR_CARULLA: Branch = { id: "b-carulla-far", chain: "carulla", name: "Carulla Usaquén", address: null, area: null, lat: 4.70, lon: -74.03 };
const JUMBO: Branch = { id: "b-jumbo", chain: "jumbo", name: "Jumbo Calle 80", address: null, area: null, lat: 4.684, lon: -74.08 };
const HOME: LatLon = [4.6480, -74.0640];

// D1 is the anchor: Carulla is cheaper for arroz and leche, by $12.300 in all.
const ITEMS = [
  item("arroz", [cand("d1", 20_000), cand("carulla", 12_700), cand("jumbo", 19_000)]),
  item("leche", [cand("d1", 9_000), cand("carulla", 4_000), cand("jumbo", 8_500)]),
  item("huevos", [cand("d1", 15_000), cand("carulla", 18_000), cand("jumbo", 17_000)]),
];

const route = (distanceM: number, durationS: number, stops = 2): RouteLike => ({
  distanceM, durationS, coordinates: [[0, 0], [1, 1]],
  legs: Array.from({ length: stops - 1 }, () => ({ distanceM: distanceM / (stops - 1), durationS: durationS / (stops - 1), steps: [] })),
});
const key = (points: LatLon[]) => points.map((p) => p.join(",")).join(";");

function provider(routes: Record<string, RouteLike | Error>, table: Record<string, number | null> = {}): RouteProviderLike {
  return {
    route: vi.fn(async (points: LatLon[]) => {
      const r = routes[key(points)];
      if (!r || r instanceof Error) throw r ?? new Error(`no stub for ${key(points)}`);
      return r;
    }),
    table: vi.fn(async (_s: LatLon[], destinations: LatLon[]) => ({ durationsS: [destinations.map((d) => table[d.join(",")] ?? null)] })),
  };
}
const pt = (b: Branch): LatLon => [b.lat, b.lon];
const travel = (mode: TravelMode) => ({ mode, ...DEFAULT_TRAVEL });
const input = (p: RouteProviderLike, extra: Partial<Parameters<typeof routeOptions>[0]> = {}) => ({
  items: ITEMS, anchor: { chain: "d1" as const, point: pt(D1), branch: D1 }, start: null, branches: [D1, CARULLA, FAR_CARULLA],
  retailers: ["d1", "carulla"] as RetailerSlug[], travel: travel("walk"), budget: 200_000, provider: p, ...extra,
});

describe("routeOptions", () => {
  it("offers a store next door that pays off, with route figures and no travel cost on foot", async () => {
    const p = provider(
      { [key([pt(D1), pt(CARULLA), pt(D1)])]: route(600, 480, 3) },
      { [pt(CARULLA).join(",")]: 240, [pt(FAR_CARULLA).join(",")]: 1500 },
    );
    const { options, leftOut } = await routeOptions(input(p));
    expect(leftOut).toEqual([]);
    expect(options.map((o) => o.label)).toEqual(["Solo en tu D1", "D1 + Carulla"]);
    expect(options[0]).toMatchObject({ goodsTotal: 44_000, saving: 0, route: null });
    expect(options[1]).toMatchObject({ saving: 12_300, extra: { distanceM: 600, durationS: 480 }, travelCost: 0, net: 12_300 });
    expect(options[1]!.stops.map((s) => s.branch?.id)).toEqual(["b-d1", "b-carulla"]);
  });

  it("routes the branch that is closest by route time, not by straight line", async () => {
    // The far Carulla is quicker to reach (a highway, say): it's the one routed.
    const p = provider(
      { [key([pt(D1), pt(FAR_CARULLA), pt(D1)])]: route(3000, 900, 3) },
      { [pt(CARULLA).join(",")]: 1100, [pt(FAR_CARULLA).join(",")]: 400 },
    );
    const { options } = await routeOptions(input(p));
    expect(options[1]!.stops[1]!.branch?.id).toBe("b-carulla-far");
  });

  it("leaves out a store whose detour is over the mode's limit", async () => {
    const p = provider(
      { [key([pt(D1), pt(JUMBO), pt(D1)])]: route(9000, 1300, 3) },
      { [pt(JUMBO).join(",")]: 650 },
    );
    // By bus: 1300 s × 1.6 + 2 waits = 50 min > 30.
    const { options, leftOut } = await routeOptions(input(p, { retailers: ["d1", "jumbo"], branches: [JUMBO], travel: travel("bus") }));
    expect(options.map((o) => o.key)).toEqual(["d1"]);
    expect(leftOut).toEqual([{ chain: "jumbo", reason: "Jumbo suma 51 min; el límite en bus es 30 min" }]);
  });

  it("on a bus trip, walks a short hop between the stores: no second fare or wait", async () => {
    const legs = (...l: [number, number][]): RouteLike => ({
      distanceM: l.reduce((s, x) => s + x[0], 0), durationS: l.reduce((s, x) => s + x[1], 0), coordinates: [[0, 0], [1, 1]],
      legs: l.map(([distanceM, durationS]) => ({ distanceM, durationS, steps: [] })),
    });
    const p = provider(
      {
        [key([HOME, pt(D1)])]: route(2000, 300),
        // Home → D1 by bus, then 480 m to the Carulla on foot.
        [key([HOME, pt(D1), pt(CARULLA)])]: legs([2000, 300], [480, 60]),
        [key([HOME, pt(CARULLA), pt(D1)])]: legs([2400, 360], [480, 60]),
      },
      { [pt(CARULLA).join(",")]: 60 },
    );
    const { options } = await routeOptions(input(p, { start: HOME, branches: [CARULLA], travel: travel("bus") }));
    // 480 m at 1,2 m/s is 400 s; the bus ride from home is the same as without the stop.
    expect(options[1]).toMatchObject({ walkBetween: true, travelCost: 0, net: 12_300, extra: { distanceM: 480, durationS: 400 } });
  });

  it("on a bus trip, rides again to a store too far to walk", async () => {
    const p = provider({ [key([pt(D1), pt(CARULLA), pt(D1)])]: route(2400, 300, 3) }, { [pt(CARULLA).join(",")]: 150 });
    const { options } = await routeOptions(input(p, { branches: [CARULLA], travel: travel("bus") }));
    expect(options[1]).toMatchObject({ walkBetween: false, travelCost: DEFAULT_TRAVEL.busFare });
  });

  it("drops an option whose route fails, and says so", async () => {
    const p = provider({ [key([pt(D1), pt(CARULLA), pt(D1)])]: new Error("timeout") }, { [pt(CARULLA).join(",")]: 240 });
    const { options, leftOut } = await routeOptions(input(p, { branches: [CARULLA] }));
    expect(options.map((o) => o.key)).toEqual(["d1"]);
    expect(leftOut).toEqual([{ chain: "carulla", reason: "No pudimos calcular la ruta a Carulla" }]);
  });

  it("says when a chain has nothing cheaper", async () => {
    const p = provider({}, { [pt(JUMBO).join(",")]: 300 });
    const items = [item("huevos", [cand("d1", 15_000), cand("jumbo", 17_000)])];
    const { leftOut } = await routeOptions(input(p, { items, retailers: ["d1", "jumbo"], branches: [JUMBO] }));
    expect(leftOut).toEqual([{ chain: "jumbo", reason: "En Jumbo nada de tu lista sale más barato" }]);
    expect(p.route).not.toHaveBeenCalled();
  });

  it("from the person's location, takes the faster order and counts only what the stop adds", async () => {
    const p = provider(
      {
        [key([HOME, pt(D1)])]: route(400, 300),
        [key([HOME, pt(D1), pt(CARULLA)])]: route(1500, 1200, 3),
        [key([HOME, pt(CARULLA), pt(D1)])]: route(1300, 1000, 3),
      },
      { [pt(CARULLA).join(",")]: 240 },
    );
    const { options } = await routeOptions(input(p, { start: HOME, branches: [CARULLA] }));
    expect(options[0]!.route?.distanceM).toBe(400);
    expect(options[1]!.stops.map((s) => s.chain)).toEqual(["carulla", "d1"]);
    expect(options[1]!.extra).toEqual({ distanceM: 900, durationS: 700 });
    expect(options[1]!.otherOrder?.stops.map((s) => s.chain)).toEqual(["d1", "carulla"]);
  });

  it("shortlists at most five branches per chain for the router", async () => {
    const many = Array.from({ length: 9 }, (_, i): Branch => ({ ...CARULLA, id: `c${i}`, lat: 4.651 + i / 1000 }));
    const p = provider({}, {});
    await routeOptions(input(p, { branches: many }));
    expect((p.table as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toHaveLength(5);
  });

  it("charges a car per km plus parking", async () => {
    const p = provider({ [key([pt(D1), pt(CARULLA), pt(D1)])]: route(2400, 600, 3) }, { [pt(CARULLA).join(",")]: 300 });
    const { options } = await routeOptions(input(p, { branches: [CARULLA], travel: travel("car") }));
    expect(options[1]).toMatchObject({ travelCost: 1400 + 3000, net: 12_300 - 4400 });
  });
});

describe("cold and heavy items last", () => {
  const coldItems = [
    item("leche", [cand("d1", 4_000), cand("carulla", 5_000)]),
    item("arveja congelada", [cand("d1", 6_000), cand("carulla", 7_000)]),
    item("arroz", [cand("d1", 20_000), cand("carulla", 12_700)]),
  ];

  it("visits the anchor last on the loop back when the milk and frozen peas are there", async () => {
    const p = provider({ [key([pt(D1), pt(CARULLA), pt(D1)])]: route(600, 480, 3) }, { [pt(CARULLA).join(",")]: 240 });
    const { options } = await routeOptions(input(p, { items: coldItems, branches: [CARULLA] }));
    expect(options[1]!.stops.map((s) => s.chain)).toEqual(["carulla", "d1"]);
    expect(options[1]!.stopLines.map((ls) => ls.map((l) => l.itemId))).toEqual([["arroz"], ["leche", "arveja congelada"]]);
    expect(options[1]!.extra).toEqual({ distanceM: 600, durationS: 480 });
  });

  it("takes a slightly slower order from home to put the cold stop last", async () => {
    const p = provider(
      {
        [key([HOME, pt(D1)])]: route(400, 300),
        [key([HOME, pt(D1), pt(CARULLA)])]: route(1500, 1100, 3),
        [key([HOME, pt(CARULLA), pt(D1)])]: route(1600, 1200, 3),
      },
      { [pt(CARULLA).join(",")]: 240 },
    );
    const { options } = await routeOptions(input(p, { items: coldItems, start: HOME, branches: [CARULLA] }));
    expect(options[1]!.stops.map((s) => s.chain)).toEqual(["carulla", "d1"]);
    expect(options[1]!.extra).toEqual({ distanceM: 1200, durationS: 900 });
  });

  it("puts cold and heavy items at the end of a stop's list", async () => {
    const p = provider({}, {});
    const items = [
      item("leche", [cand("d1", 4_000)]),
      { ...item("arroz", [{ ...cand("d1", 20_000), size: { amount: 5000, unit: "g" as const } }]), quantity: 5000, unit: "g" as const },
      item("galletas", [cand("d1", 3_000)]),
    ];
    const { options } = await routeOptions(input(p, { items, branches: [] }));
    expect(options[0]!.stopLines[0]!.map((l) => l.itemId)).toEqual(["galletas", "arroz", "leche"]);
  });
});
