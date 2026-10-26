import { describe, expect, it } from "vitest";
import type { BaseUnit } from "../units";
import { acceptableCandidates, optimize } from "./plan";
import type { Candidate, PlanItem, RetailerSlug } from "./types";

let seq = 0;
function cand(retailer: RetailerSlug, price: number, amount: number, unit: BaseUnit, extra: Partial<Candidate> = {}): Candidate {
  seq++;
  return {
    listingId: `${retailer}-${seq}`,
    retailer,
    name: extra.name ?? `Producto ${seq}`,
    brand: null,
    price,
    size: { amount, unit },
    url: `https://example.com/${seq}`,
    source: `${retailer}:vtex-catalog`,
    observedAt: "2026-10-26T10:00:00.000Z",
    priceStatus: "snapshot",
    isLiteralMatch: true,
    isSubstitute: false,
    ...extra,
  };
}

function item(id: string, quantity: number, unit: BaseUnit, candidates: Candidate[], extra: Partial<PlanItem> = {}): PlanItem {
  return { id, label: id, quantity, unit, essential: true, allowSubstitute: true, candidates, ...extra };
}

const BOTH: RetailerSlug[] = ["d1", "jumbo"];

describe("store assignment", () => {
  it("assigns every coverable item to exactly one store", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item(`i${i}`, 1, "unit", [cand("d1", 1000 + i * 10, 1, "unit"), cand("jumbo", 1050, 1, "unit")]),
    );
    const plan = optimize(items, { budget: 100_000, retailers: BOTH });
    const lines = plan.stores.flatMap((s) => s.lines);
    expect(lines.map((l) => l.itemId).sort()).toEqual(items.map((i) => i.id).sort());
    for (const l of lines) expect(l.lineTotal).toBe(l.packs * l.candidate.price);
  });

  it("lists items with no candidates as unavailable, unpriced", () => {
    const plan = optimize([item("arroz", 1000, "g", [cand("d1", 4000, 1000, "g")]), item("quinua", 500, "g", [])], {
      budget: 50_000,
      retailers: BOTH,
    });
    expect(plan.unavailable).toEqual([{ itemId: "quinua", label: "quinua", reason: "No disponible en ninguna tienda" }]);
    expect(plan.stores.flatMap((s) => s.lines).map((l) => l.itemId)).toEqual(["arroz"]);
  });
});

describe("extra stops only when they pay off", () => {
  const list = (bAtJumbo: number) => [
    item("a", 1, "unit", [cand("d1", 100_000, 1, "unit"), cand("jumbo", 120_000, 1, "unit")]),
    item("b", 1, "unit", [cand("d1", 82_000, 1, "unit"), cand("jumbo", bAtJumbo, 1, "unit")]),
  ];

  it("recommends 2 stops when the split saves more than the trip cost", () => {
    const plan = optimize(list(65_000), { budget: 300_000, retailers: BOTH, tripCost: 10_000 });
    expect(plan.stops).toBe(2);
    expect(plan.total).toBe(165_000);
    const oneStop = plan.alternatives.find((a) => a.stops === 1)!;
    expect(oneStop).toMatchObject({ retailers: ["d1"], total: 182_000, difference: 17_000 });
  });

  it("recommends 1 stop when the split saves less than the trip cost, still showing the 2-stop option", () => {
    const plan = optimize(list(78_000), { budget: 300_000, retailers: BOTH, tripCost: 10_000 });
    expect(plan.stops).toBe(1);
    expect(plan.stores.map((s) => s.retailer)).toEqual(["d1"]);
    expect(plan.alternatives.find((a) => a.stops === 2)).toMatchObject({ total: 178_000, difference: -4_000, recommended: false });
  });

  it("picks the lowest goods total when the trip cost is 0", () => {
    const plan = optimize(list(78_000), { budget: 300_000, retailers: BOTH, tripCost: 0 });
    expect(plan.stops).toBe(2);
    expect(plan.total).toBe(178_000);
  });
});

describe("whole packs", () => {
  it("compares line totals, not package prices (lentils 454 g vs 500 g)", () => {
    const plan = optimize(
      [item("lenteja", 1000, "g", [cand("d1", 2710, 454, "g"), cand("jumbo", 2550, 500, "g")])],
      { budget: 50_000, retailers: BOTH },
    );
    const [line] = plan.stores.flatMap((s) => s.lines);
    expect(line).toMatchObject({ packs: 2, lineTotal: 5100 });
    expect(line!.candidate.retailer).toBe("jumbo");
  });

  it("covers counts with whole trays (30 eggs from 15-egg trays)", () => {
    const plan = optimize([item("huevos", 30, "unit", [cand("d1", 9000, 15, "unit")])], { budget: 50_000, retailers: BOTH });
    expect(plan.stores[0]!.lines[0]).toMatchObject({ packs: 2, lineTotal: 18_000 });
  });
});

describe("substitution preferences", () => {
  const rice = () => [
    cand("jumbo", 4890, 1000, "g", { name: "Arroz Diana 1 kg" }),
    cand("d1", 3600, 1000, "g", { name: "Arroz Albar 1 kg", isLiteralMatch: false, isSubstitute: true }),
  ];

  it("uses only the requested product when substitution is disabled", () => {
    const plan = optimize([item("arroz", 1000, "g", rice(), { allowSubstitute: false })], { budget: 50_000, retailers: BOTH });
    expect(plan.stores[0]!.lines[0]!.candidate.name).toBe("Arroz Diana 1 kg");
  });

  it("chooses the cheaper equivalent when allowed, and explains it", () => {
    const plan = optimize([item("arroz", 1000, "g", rice())], { budget: 50_000, retailers: BOTH });
    const line = plan.stores[0]!.lines[0]!;
    expect(line.candidate.name).toBe("Arroz Albar 1 kg");
    expect(line.isSubstitute).toBe(true);
    expect(line.reason).toContain("Reemplaza a Arroz Diana 1 kg ($1.290 menos)");
  });

  it("honors a pinned listing", () => {
    const candidates = rice();
    const pinned = item("arroz", 1000, "g", candidates, { pinnedListingId: candidates[0]!.listingId });
    expect(acceptableCandidates(pinned).map((c) => c.listingId)).toEqual([candidates[0]!.listingId]);
  });

  it("never drops items: rejects candidates of the wrong unit kind", () => {
    const wrong = item("leche", 1000, "ml", [cand("d1", 3000, 1000, "g")]);
    const plan = optimize([wrong], { budget: 50_000, retailers: BOTH });
    expect(plan.unavailable[0]!.reason).toBe("No encontramos presentaciones con esa medida");
  });
});

describe("savings baseline", () => {
  it("measures savings against one store, literal matches, no substitutions", () => {
    const items = [
      item("arroz", 1000, "g", [
        cand("jumbo", 4890, 1000, "g"),
        cand("d1", 5200, 1000, "g"),
        cand("d1", 3600, 1000, "g", { isLiteralMatch: false, isSubstitute: true }),
      ]),
      item("leche", 1000, "ml", [cand("jumbo", 4300, 1000, "ml"), cand("d1", 3900, 1000, "ml")]),
    ];
    const plan = optimize(items, { budget: 100_000, retailers: BOTH });
    // Baseline: both stores cover 2/2 literally; Jumbo 9.190 vs D1 9.100 → D1
    expect(plan.baseline).toMatchObject({ retailer: "d1", total: 9100, description: "Comparado con comprar todo en D1, sin cambios de marca" });
    expect(plan.total).toBe(7500); // D1 substitute rice + D1 milk, one stop
    expect(plan.savings).toBe(1600);
  });

  it("excludes items the baseline store can't cover from both sides", () => {
    const items = [
      item("arroz", 1000, "g", [cand("d1", 4000, 1000, "g"), cand("jumbo", 4500, 1000, "g")]),
      item("leche", 1000, "ml", [cand("d1", 3900, 1000, "ml"), cand("jumbo", 4000, 1000, "ml")]),
      item("quinua", 500, "g", [cand("jumbo", 9000, 500, "g")]),
    ];
    const plan = optimize(items, { budget: 100_000, retailers: BOTH, tripCost: 0 });
    expect(plan.baseline).toMatchObject({ retailer: "jumbo", itemIds: ["arroz", "leche", "quinua"] });
    const d1Only = optimize(items.slice(0, 2), { budget: 100_000, retailers: ["d1"] });
    expect(d1Only.baseline?.description).toBe("Comparado con comprar todo en D1, sin cambios de marca");
  });
});

describe("plan output", () => {
  it("groups by store; subtotals add up; remaining budget is budget − total", () => {
    const items = [
      item("a", 1, "unit", [cand("d1", 100_000, 1, "unit"), cand("jumbo", 120_000, 1, "unit")]),
      item("b", 1, "unit", [cand("d1", 82_000, 1, "unit"), cand("jumbo", 51_350, 1, "unit")]),
      item("c", 1, "unit", [cand("d1", 20_000, 1, "unit")]),
    ];
    const plan = optimize(items, { budget: 200_000, retailers: BOTH });
    expect(plan.total).toBe(171_350);
    expect(plan.remaining).toBe(28_650);
    expect(plan.overBudget).toBe(0);
    expect(plan.stores.reduce((s, st) => s + st.subtotal, 0)).toBe(plan.total);
    expect(plan.stores.map((s) => s.retailer)).toEqual(["d1", "jumbo"]);
  });

  it("explains each line with observed prices", () => {
    const items = [
      item("doria", 1, "unit", [cand("d1", 3990, 1, "unit"), cand("jumbo", 5100, 1, "unit")]),
      item("quinua", 1, "unit", [cand("d1", 4990, 1, "unit")]),
    ];
    const lines = optimize(items, { budget: 50_000, retailers: BOTH }).stores.flatMap((s) => s.lines);
    expect(lines.find((l) => l.itemId === "doria")!.reason).toBe("$1.110 más barato que en Jumbo");
    expect(lines.find((l) => l.itemId === "quinua")!.reason).toBe("Solo disponible en D1");
  });

  it("explains consolidation when a line costs more to save a stop", () => {
    const items = [
      item("a", 1, "unit", [cand("d1", 10_000, 1, "unit")]),
      item("b", 1, "unit", [cand("d1", 5_500, 1, "unit"), cand("jumbo", 5_000, 1, "unit")]),
    ];
    const line = optimize(items, { budget: 50_000, retailers: BOTH }).stores[0]!.lines.find((l) => l.itemId === "b")!;
    expect(line.reason).toBe("$500 más caro que en Jumbo, pero te ahorras esa parada");
  });

  it("is deterministic", () => {
    const build = () => (seq = 0, [
      item("a", 1000, "g", [cand("d1", 4000, 500, "g", { listingId: "x" }), cand("jumbo", 8000, 1000, "g", { listingId: "y" })]),
      item("b", 2, "unit", [cand("d1", 3000, 1, "unit", { listingId: "z" }), cand("jumbo", 3000, 1, "unit", { listingId: "w" })]),
    ]);
    const options = { budget: 30_000, retailers: BOTH, tripCost: 5_000 };
    expect(optimize(build(), options)).toEqual(optimize(build(), options));
  });
});

describe("unit-counted items", () => {
  it("accepts any package for '1 und' items, one package per unit", () => {
    const plan = optimize(
      [item("galletas", 2, "unit", [cand("d1", 2500, 300, "g"), cand("jumbo", 3100, 250, "g")])],
      { budget: 50_000, retailers: BOTH },
    );
    expect(plan.stores[0]!.lines[0]).toMatchObject({ packs: 2, lineTotal: 5000 });
    expect(plan.unavailable).toEqual([]);
  });

  it("still rejects g candidates for ml items", () => {
    expect(acceptableCandidates(item("leche", 1000, "ml", [cand("d1", 3000, 1000, "g")]))).toEqual([]);
  });
});
