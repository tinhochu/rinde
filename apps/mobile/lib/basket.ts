import { apiBase } from "./api";
import type { Offer, Store } from "./market";
import { sessionId } from "./session";
import type { CartLine } from "./shop";

/** One basket product at every store, cheapest first (see apps/web/src/server/basket.ts). */
export type BasketLine = { id: string; offers: Offer[]; inStore: Offer[]; missing: Store[] };
export type BasketPrices = { lines: BasketLine[]; unpriced: string[]; reasons: string[]; checkedAt: string };

export async function fetchBasket(ids: string[], signal?: AbortSignal): Promise<BasketPrices> {
  const response = await fetch(`${apiBase()}/api/basket`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "No pudimos consultar los precios.");
  return data as BasketPrices;
}

/** One of the person's own staples: bought on their receipts, or picked from search. */
export type Basic = BasketLine & { source: "receipt" | "search"; times: number };

export async function fetchBasics(ids: string[], signal?: AbortSignal): Promise<Basic[]> {
  const response = await fetch(`${apiBase()}/api/basics`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Rinde-Session": await sessionId() }, body: JSON.stringify({ ids }), signal,
  });
  if (!response.ok) return [];
  return ((await response.json()) as { items: Basic[] }).items;
}

export type PricedLine = { cart: CartLine; prices: BasketLine };
/** The products to buy at one store: those it sells cheapest. */
export type Stop = { store: Store; total: number; lines: PricedLine[] };
/** The whole priced basket at one store, and how many of its products that store has. */
export type SingleStore = { store: Store; total: number; has: number };

/** Each product at the store where it's cheapest, grouped by store: most products first. */
export function stopsFor(lines: PricedLine[]): Stop[] {
  const stops = new Map<Store, Stop>();
  for (const line of lines) {
    const best = line.prices.offers[0]!;
    const stop = stops.get(best.store) ?? { store: best.store, total: 0, lines: [] };
    stop.total += best.price * line.cart.count;
    stop.lines.push(line);
    stops.set(best.store, stop);
  }
  return [...stops.values()].sort((a, b) => b.lines.length - a.lines.length || b.total - a.total);
}

/** Buying everything at one store instead: most complete store first, then cheapest. */
export function singleStores(lines: PricedLine[]): SingleStore[] {
  const stores = [...new Set(lines.flatMap(l => l.prices.offers.map(o => o.store)))];
  return stores
    .map(store => {
      const here = lines.flatMap(l => l.prices.offers.filter(o => o.store === store).map(o => o.price * l.cart.count));
      return { store, total: here.reduce((s, x) => s + x, 0), has: here.length };
    })
    .sort((a, b) => b.has - a.has || a.total - b.total);
}
