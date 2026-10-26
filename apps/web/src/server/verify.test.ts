import { describe, expect, it } from "vitest";
import type { Candidate, PlanItem, RetailerSlug } from "@rinde/core";
import { planAndVerify, type LiveResult, type VerifyDeps } from "./verify";

const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function cand(listingId: string, retailer: RetailerSlug, price: number, observedAt = hoursAgo(6)): Candidate {
  return {
    listingId, retailer, name: listingId, brand: null, price, size: { amount: 1000, unit: "g" },
    url: "", source: `${retailer}:vtex-catalog`, observationId: `obs-${listingId}`, observedAt,
    priceStatus: "snapshot", isLiteralMatch: true, isSubstitute: false,
  };
}
const item = (id: string, candidates: Candidate[]): PlanItem =>
  ({ id, label: id, quantity: 1000, unit: "g", essential: true, allowSubstitute: true, candidates });

/** Fake retailer: per-store live prices (null = unavailable) or a thrown error. */
function fakeDeps(live: Partial<Record<RetailerSlug, Record<string, number | null> | "error" | "hang">>): VerifyDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    now: () => NOW,
    async fetchLive(retailer, ids) {
      calls.push(`${retailer}:${ids.join(",")}`);
      const spec = live[retailer];
      if (spec === "error") throw new Error("unreachable");
      if (spec === "hang") return new Promise(() => {});
      return new Map(ids.map((id): [string, LiveResult] => {
        const price = spec?.[id];
        return [id, price == null ? null : { price, observedAt: new Date(NOW).toISOString(), observationId: `live-${id}` }];
      }));
    },
  };
}
const OPTIONS = { budget: 100_000, retailers: ["d1", "jumbo"] as RetailerSlug[] };
const lines = (r: Awaited<ReturnType<typeof planAndVerify>>) => r.plan.stores.flatMap((s) => s.lines);

describe("planAndVerify", () => {
  it("uses the live price when it changed since the snapshot", async () => {
    const deps = fakeDeps({ jumbo: { roa: 5290 } });
    const result = await planAndVerify([item("arroz", [cand("roa", "jumbo", 4890)])], OPTIONS, deps);
    expect(lines(result)[0]!.candidate).toMatchObject({ price: 5290, priceStatus: "live", observationId: "live-roa" });
  });

  it("re-plans without a listing that went out of stock", async () => {
    const deps = fakeDeps({ d1: { a: null }, jumbo: { b: 4500 } });
    const result = await planAndVerify([item("arroz", [cand("a", "d1", 4000), cand("b", "jumbo", 4500)])], OPTIONS, deps);
    expect(lines(result)[0]!.candidate).toMatchObject({ listingId: "b", priceStatus: "live" });
    expect(deps.calls).toEqual(["d1:a", "jumbo:b"]);
  });

  it("marks the item unavailable when its only listing went out of stock", async () => {
    const result = await planAndVerify([item("arroz", [cand("a", "d1", 4000)])], OPTIONS, fakeDeps({ d1: { a: null } }));
    expect(result.plan.unavailable).toEqual([{ itemId: "arroz", label: "arroz", reason: "No disponible en este momento" }]);
  });

  it("falls back to a fresh snapshot price when the retailer fails", async () => {
    const progress: unknown[] = [];
    const result = await planAndVerify([item("arroz", [cand("a", "jumbo", 4890, hoursAgo(6))])], OPTIONS, fakeDeps({ jumbo: "error" }), {
      onProgress: (p) => progress.push(p),
    });
    expect(lines(result)[0]!.candidate).toMatchObject({ price: 4890, priceStatus: "snapshot" });
    expect(progress).toContainEqual(expect.objectContaining({ store: "jumbo", failed: true }));
  });

  it("drops a stale snapshot price when the retailer fails", async () => {
    const result = await planAndVerify([item("arroz", [cand("a", "jumbo", 4890, hoursAgo(40))])], OPTIONS, fakeDeps({ jumbo: "error" }));
    expect(lines(result)).toEqual([]);
    expect(result.plan.unavailable[0]!.reason).toBe("Precio desactualizado");
  });

  it("re-optimizes when a live price increase flips the item to another store", async () => {
    const deps = fakeDeps({ d1: { a: 5000 }, jumbo: { b: 4500 } });
    const result = await planAndVerify([item("arroz", [cand("a", "d1", 4000), cand("b", "jumbo", 4500)])], OPTIONS, deps);
    expect(lines(result)[0]!.candidate).toMatchObject({ listingId: "b", retailer: "jumbo", priceStatus: "live" });
    expect(result.rounds).toBe(2);
  });

  it("stops waiting at the time budget and uses the fallback", async () => {
    const started = Date.now();
    const result = await planAndVerify([item("arroz", [cand("a", "d1", 4000)])], OPTIONS, fakeDeps({ d1: "hang" }), {
      signal: AbortSignal.timeout(50),
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(lines(result)[0]!.candidate.priceStatus).toBe("snapshot");
  });
});
