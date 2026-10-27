import { useEffect, useState } from "react";
import { apiBase } from "./api";
import type { Offer, Unit } from "./market";
import type { ComparedProduct } from "./shop";

// Wire type for POST /api/value (see apps/web/src/server/value-groups.ts). Keep in sync.
export type ValueGroup = { label: string; keys: string[] };

/**
 * Price per gram, millilitre or unit for one offer, from its stored price and pack size. Weighed
 * produce is already priced per kg or per unit. Null when the pack size is unknown.
 */
export function pricePerBase(offer: Offer): number | null {
  if (offer.produce) return offer.produce.per === "kg" ? offer.price / 1000 : offer.price;
  return offer.pack > 0 ? offer.price / offer.pack : null;
}

/** "$ 38.000/kg", "$ 4.200/L", "$ 450/und": the price per base unit, in the unit people read. */
export function perLabel(perBase: number, unit: Unit) {
  const value = unit === "und" ? perBase : perBase * 1000;
  return { value: Math.round(value), per: unit === "g" ? "kg" : unit === "ml" ? "L" : "und" };
}

/** A product's best offer by price per base unit (offers are in the chosen stores already). */
export function bestPerBase(product: ComparedProduct): { offer: Offer; perBase: number } | null {
  let best: { offer: Offer; perBase: number } | null = null;
  for (const offer of product.offers) {
    const perBase = pricePerBase(offer);
    if (perBase !== null && (!best || perBase < best.perBase)) best = { offer, perBase };
  }
  return best;
}

export type ValuePick = {
  label: string;
  unit: Unit;
  best: { product: ComparedProduct; offer: Offer; perBase: number };
  /**
   * The median price per base unit of the kind. Not the dearest: some stores give a can's drained
   * weight ("Atún (98 gr)") where others give its net weight, which makes single products look far
   * dearer per kg than they are; the median isn't moved by a few of those.
   */
  typical: number;
  compared: number;
};

/**
 * For each kind of product, the one that gives the most per peso, and the kind's typical price per unit.
 * Every number comes from stored prices and sizes; the groups only say which products are alike.
 */
export function valuePicks(groups: ValueGroup[], products: ComparedProduct[]): ValuePick[] {
  const byKey = new Map(products.map(p => [p.key, p]));
  return groups.flatMap(g => {
    const priced = g.keys
      .map(k => byKey.get(k))
      .filter((p): p is ComparedProduct => !!p)
      .map(product => ({ product, best: bestPerBase(product) }))
      .filter((x): x is { product: ComparedProduct; best: { offer: Offer; perBase: number } } => !!x.best)
      .sort((a, b) => a.best.perBase - b.best.perBase);
    if (priced.length < 2) return [];
    const first = priced[0]!;
    const values = priced.map(x => x.best.perBase);
    const mid = Math.floor(values.length / 2);
    const typical = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
    if (typical <= first.best.perBase) return [];
    return [{
      label: g.label,
      unit: first.product.unit,
      best: { product: first.product, offer: first.best.offer, perBase: first.best.perBase },
      typical,
      compared: priced.length,
    }];
  });
}

const cache = new Map<string, ValueGroup[]>();

/**
 * Which results are the same kind of product, brand aside. Arrives after the results (`loading` until
 * then, so the screen can hold its place); empty on failure.
 */
export function useValueGroups(query: string, products: ComparedProduct[] | undefined): { groups: ValueGroup[]; loading: boolean } {
  const [groups, setGroups] = useState<ValueGroup[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const key = products ? `${query.toLowerCase()}|${products.map(p => p.key).join(",")}` : "";

  useEffect(() => {
    if (!products?.length || !query) {
      setGroups([]);
      return setLoadedKey(key);
    }
    const hit = cache.get(key);
    if (hit) {
      setGroups(hit);
      return setLoadedKey(key);
    }
    setGroups([]);
    const controller = new AbortController();
    fetch(`${apiBase()}/api/value`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        products: products.slice(0, 60).map(p => ({ key: p.key, name: p.name, brand: p.brand, pack: p.pack, unit: p.unit })),
      }),
      signal: controller.signal,
    })
      .then(r => (r.ok ? r.json() : { groups: [] }))
      .then((data: { groups?: ValueGroup[] }) => {
        cache.set(key, data.groups ?? []);
        setGroups(data.groups ?? []);
        setLoadedKey(key);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedKey(key);
      });
    return () => controller.abort();
    // `key` stands for query + products
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { groups, loading: loadedKey !== key };
}
