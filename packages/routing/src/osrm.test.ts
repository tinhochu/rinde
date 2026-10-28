import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { RouteUnavailable, createOsrmProvider, haversineM, type LatLon } from "./index";

// Recorded from routing.openstreetmap.de on 2026-10-28: a D1 and a Carulla in Chapinero, Bogotá.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));
const D1: LatLon = [4.6500185, -74.0659549];
const CARULLA: LatLon = [4.6552307, -74.0597196];
const OTHER: LatLon = [4.6612833, -74.0562149];

const answer = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

describe("OSRM provider", () => {
  it("reads a walking route: distance, time, steps and the street line", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => answer(fixture("foot-route")));
    const route = await createOsrmProvider({ fetch: fetchMock }).route([D1, CARULLA], "foot");
    expect(Math.round(route.distanceM)).toBe(1259);
    expect(Math.round(route.durationS / 60)).toBe(17);
    expect(route.distanceM).toBeGreaterThan(haversineM(D1, CARULLA));
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]!.steps[0]).toMatchObject({ type: "depart", modifier: "left" });
    expect(route.legs[0]!.steps.at(-1)).toMatchObject({ type: "arrive" });
    // The line starts at the D1 and ends at the Carulla, within a street's width.
    expect(haversineM(route.coordinates[0]!, D1)).toBeLessThan(50);
    expect(haversineM(route.coordinates.at(-1)!, CARULLA)).toBeLessThan(50);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/routed-foot/route/v1/driving/-74.06595,4.65002;-74.05972,4.65523?");
  });

  it("splits a round trip into legs", async () => {
    const route = await createOsrmProvider({ fetch: vi.fn(async (_url: string | URL | Request) => answer(fixture("car-route-loop"))) }).route([D1, CARULLA, D1], "car");
    expect(route.legs.map((l) => Math.round(l.distanceM))).toEqual([1997, 1379]);
    expect(route.legs[0]!.steps[0]).toMatchObject({ type: "depart", name: "Avenida Calle 63" });
  });

  it("reads a table of durations and distances from one source", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => answer(fixture("foot-table")));
    const table = await createOsrmProvider({ fetch: fetchMock }).table([D1], [D1, CARULLA, OTHER], "foot");
    expect(table.distancesM[0]).toEqual([0, 1258.8, 1933]);
    expect(table.durationsS[0]![1]).toBe(1006.8);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("sources=0&destinations=1;2;3");
  });

  it("keeps a route for a week, and asks again after", async () => {
    let t = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request) => answer(fixture("foot-route")));
    const provider = createOsrmProvider({ fetch: fetchMock, now: () => t });
    await provider.route([D1, CARULLA], "foot");
    t = 6 * 24 * 3_600_000;
    await provider.route([[4.650020, -74.065954], CARULLA], "foot"); // same point, GPS noise
    expect(fetchMock).toHaveBeenCalledTimes(1);
    t = 8 * 24 * 3_600_000;
    await provider.route([D1, CARULLA], "foot");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails with RouteUnavailable when the server errs or finds nothing, and doesn't keep the failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer({ code: "NoRoute" }, 400))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(answer(fixture("foot-route")));
    const provider = createOsrmProvider({ fetch: fetchMock });
    await expect(provider.route([D1, CARULLA], "foot")).rejects.toBeInstanceOf(RouteUnavailable);
    await expect(provider.route([D1, CARULLA], "foot")).rejects.toBeInstanceOf(RouteUnavailable);
    await expect(provider.route([D1, CARULLA], "foot")).resolves.toMatchObject({ legs: [{}] });
  });

  it("sends at most two requests at once", async () => {
    let inFlight = 0, most = 0;
    const fetchMock = vi.fn(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return answer(fixture("foot-route"));
    });
    const provider = createOsrmProvider({ fetch: fetchMock });
    await Promise.all([0, 1, 2, 3, 4].map((i) => provider.route([D1, [4.66 + i / 1000, -74.06]], "foot")));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(most).toBe(2);
  });
});

describe.skipIf(!process.env["ROUTING_LIVE"])("OSRM live (ROUTING_LIVE=1)", () => {
  it("walks the Chapinero pair along the streets, longer than the straight line", async () => {
    const route = await createOsrmProvider().route([D1, CARULLA], "foot");
    expect(route.distanceM).toBeGreaterThan(haversineM(D1, CARULLA));
    expect(route.distanceM).toBeGreaterThan(1100);
    expect(route.distanceM).toBeLessThan(1500);
  });
});
