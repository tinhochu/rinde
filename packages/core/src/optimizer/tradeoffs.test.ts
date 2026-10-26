import { describe, expect, it } from "vitest";
import type { BaseUnit } from "../units";
import { optimize } from "./plan";
import { applyTradeoff, proposeTradeoffs } from "./tradeoffs";
import type { Candidate, PlanItem, RetailerSlug } from "./types";

let seq = 0;
function cand(retailer: RetailerSlug, price: number, amount: number, unit: BaseUnit, extra: Partial<Candidate> = {}): Candidate {
  seq++;
  return {
    listingId: `${retailer}-${seq}`, retailer, name: `Producto ${seq}`, brand: null, price, size: { amount, unit },
    url: "", source: `${retailer}:vtex-catalog`, observedAt: "2026-10-26T10:00:00.000Z", priceStatus: "snapshot",
    isLiteralMatch: true, isSubstitute: false, ...extra,
  };
}
function item(id: string, quantity: number, unit: BaseUnit, candidates: Candidate[], extra: Partial<PlanItem> = {}): PlanItem {
  return { id, label: id, quantity, unit, essential: true, allowSubstitute: true, candidates, ...extra };
}
const BOTH: RetailerSlug[] = ["d1", "jumbo"];

describe("proposeTradeoffs", () => {
  it("proposes nothing within budget", () => {
    const items = [item("arroz", 1000, "g", [cand("d1", 4000, 1000, "g")], { essential: false })];
    expect(proposeTradeoffs(items, { budget: 10_000, retailers: BOTH })).toEqual([]);
  });

  it("marks the plan over budget and offers savings", () => {
    const items = [
      item("mercado", 1, "unit", [cand("d1", 151_350, 1, "unit")]),
      item("galletas", 1, "unit", [cand("d1", 20_000, 1, "unit")], { essential: false }),
    ];
    const plan = optimize(items, { budget: 150_000, retailers: BOTH });
    expect(plan.total).toBe(171_350);
    expect(plan.overBudget).toBe(21_350);
    const proposals = proposeTradeoffs(items, { budget: 150_000, retailers: BOTH }, plan);
    expect(proposals).toEqual([
      expect.objectContaining({ key: "drop:galletas", saving: 20_000, title: "Quitar galletas de la lista: ahorras $20.000" }),
    ]);
  });

  it("never reduces or drops an essential item", () => {
    const items = [item("arroz", 2000, "g", [cand("d1", 4000, 1000, "g")])];
    const proposals = proposeTradeoffs(items, { budget: 1_000, retailers: BOTH });
    expect(proposals.filter((p) => p.itemId === "arroz" && (p.kind === "drop" || p.kind === "smaller-amount"))).toEqual([]);
  });

  it("offers adding a stop when it lowers the goods total", () => {
    const items = [
      item("a", 1, "unit", [cand("d1", 50_000, 1, "unit"), cand("jumbo", 60_000, 1, "unit")]),
      item("b", 1, "unit", [cand("d1", 20_000, 1, "unit"), cand("jumbo", 14_000, 1, "unit")]),
    ];
    const options = { budget: 65_000, retailers: BOTH, tripCost: 10_000 };
    const plan = optimize(items, options);
    expect(plan.stops).toBe(1);
    const [proposal] = proposeTradeoffs(items, options, plan);
    expect(proposal).toMatchObject({ key: "add-stop:d1+jumbo", saving: 6_000, title: "Ir también a Jumbo: ahorras $6.000" });

    const next = applyTradeoff(items, options, proposal!.change);
    const replanned = optimize(next.items, next.options);
    expect(replanned.stops).toBe(2);
    expect(replanned.total).toBe(64_000);
  });

  it("asks before using another brand, and ranks it before a bigger drop", () => {
    const items = [
      item("arroz", 1000, "g", [cand("jumbo", 7000, 1000, "g"), cand("jumbo", 4000, 1000, "g", { isLiteralMatch: false, isSubstitute: true })], { allowSubstitute: false }),
      item("galletas", 1, "unit", [cand("jumbo", 6000, 1, "unit")], { essential: false }),
    ];
    const proposals = proposeTradeoffs(items, { budget: 5_000, retailers: BOTH });
    expect(proposals.map((p) => [p.key, p.saving])).toEqual([
      ["allow-brand:arroz", 3_000],
      ["drop:galletas", 6_000],
    ]);
    expect(proposals[0]!.title).toBe("¿Aceptas otra marca de arroz? Ahorras $3.000");
  });

  it("offers a smaller amount: one pack fewer, or a smaller presentation", () => {
    const items = [
      item("queso", 1000, "g", [cand("d1", 9000, 500, "g")], { essential: false }),
      item("cafe", 500, "g", [cand("d1", 12_000, 500, "g"), cand("d1", 7000, 250, "g")], { essential: false, label: "café" }),
    ];
    const proposals = proposeTradeoffs(items, { budget: 1_000, retailers: BOTH });
    const smaller = proposals.filter((p) => p.kind === "smaller-amount");
    expect(smaller.map((p) => p.title)).toEqual([
      "Llevar 500 g de queso en vez de 1 kg: ahorras $9.000",
      "Llevar 250 g de café en vez de 500 g: ahorras $5.000",
    ]);
  });

  it("does not offer rejected proposals again, and returns at most 5", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`extra${i}`, 1, "unit", [cand("d1", 1000 + i, 1, "unit")], { essential: false }));
    const options = { budget: 100, retailers: BOTH };
    const all = proposeTradeoffs(items, options);
    expect(all).toHaveLength(5);
    const again = proposeTradeoffs(items, options, undefined, new Set([all[0]!.key]));
    expect(again.map((p) => p.key)).not.toContain(all[0]!.key);
  });

  it("accepting proposals until within budget ends the proposals", () => {
    let items = [
      item("base", 1, "unit", [cand("d1", 40_000, 1, "unit")]),
      item("galletas", 1, "unit", [cand("d1", 8_000, 1, "unit")], { essential: false }),
      item("gaseosa", 1, "unit", [cand("d1", 6_000, 1, "unit")], { essential: false }),
    ];
    let options = { budget: 45_000, retailers: BOTH } as Parameters<typeof optimize>[1];
    for (let i = 0; i < 5; i++) {
      const [first] = proposeTradeoffs(items, options);
      if (!first) break;
      ({ items, options } = applyTradeoff(items, options, first.change));
    }
    const plan = optimize(items, options);
    expect(plan.overBudget).toBe(0);
    expect(proposeTradeoffs(items, options, plan)).toEqual([]);
  });
});
