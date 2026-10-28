import { describe, expect, it } from "vitest";
import type { MatchItem } from "@rinde/core";
import { judgeSameProduct } from "./same-product";

// Opt-in: calls the real Meta Model API. `MUSE_LIVE=1 npx vitest run src/server/same-product.live.test.ts`
const item = (id: string, name: string, brand: string, aisle = "pantry"): MatchItem => ({ id, name, brand, aisle });

// Real Jumbo listings against real D1 listings with other barcodes (2026-10-28), plus a store's own name for a variety.
const CASES: { target: MatchItem; store: MatchItem[]; same: string | null }[] = [
  { target: item("live-sal", "Sal marina Refisal x800g", "Refisal"), store: [item("d1-sal", "Sal Marina Refisal 800 G", "REFISAL")], same: "d1-sal" },
  { target: item("live-muuu", "Galleta de Leche MUUU x216g", "Colombina"), store: [item("d1-muuu", "Galleta Muuu Leche Colombina 216 Grs", "Colombina")], same: "d1-muuu" },
  {
    target: item("live-arroz", "Arroz Diana blanco x1kg", "Diana"),
    store: [item("d1-coco", "Arroz Sabor A Coco Diana 1.000 G", "Diana"), item("d1-integral", "Arroz Integral Diana 1.000 G", "Diana")],
    same: null,
  },
  { target: item("live-coca", "Gaseosa Coca-Cola Zero 1.75 lt", "Coca-Cola", "drinks"), store: [item("d1-coca", "Gaseosa Coca Cola 1750 Ml", "Coca-Cola", "drinks")], same: null },
  {
    target: item("live-leche", "Leche deslactosada Alpina x1L", "Alpina", "dairy"),
    store: [item("x-leche20", "Leche 2.0 Alpina 1000 ml", "Alpina", "dairy"), item("x-entera", "Leche Entera Alpina 1000 ml", "Alpina", "dairy")],
    same: null,
  },
];

describe.skipIf(!process.env["MUSE_LIVE"])("judgeSameProduct against Muse (live)", () => {
  it.each(CASES)("$target.name", async ({ target, store, same }) => {
    const verdict = await judgeSameProduct(target, store);
    console.log(`[muse] ${target.name} → ${verdict.pick?.name ?? "ninguno"} (${verdict.by}): ${verdict.reason}`);
    expect(verdict.by).toBe("muse");
    expect(verdict.pick?.id ?? null).toBe(same);
    expect(verdict.reason).toBeTruthy();
  }, 60_000);
});
