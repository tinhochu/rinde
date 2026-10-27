import { matchProduce } from "@rinde/core";
import type { RetailerSlug } from "@rinde/db";
import { aisleOf } from "./aisles";
import { STORE_BY_SLUG, type Aisle, type Offer, type Produce, type Store } from "./contract";

/** The listing fields produce recognition needs (see `ListingRow` in offers.ts). */
export type ProduceCandidate = { name: string; size: string | null; unit: "g" | "ml" | "unit" | null; category: string | null };

/**
 * The canonical produce item an online listing is, when it unambiguously is one: its name starts
 * with a produce word, it sits in the produce aisle, and its pack is the reference size the group
 * prices (1 kg, or 1 unit). Other packs and unknown sizes stay separate cards, so shelf prices
 * compare like with like instead of a 500 g bag against a per-kg price. Chains code fresh produce
 * privately (Jumbo "2899", D1 "7700304981663" for plátano), so barcodes can never group it.
 */
export function onlineProduceOf(r: ProduceCandidate): Produce | undefined {
  const item = matchProduce(r.name);
  if (!item || aisleOf(r.category, r.name) !== "produce") return undefined;
  const size = r.size ? Number(r.size) : NaN;
  if (r.unit === "g" && size === 1000) return { slug: item.slug, per: "kg" };
  if (r.unit === "unit" && size === 1) return { slug: item.slug, per: "unit" };
  return undefined;
}

/**
 * Stores checked that don't carry this product. Only a shared barcode proves absence — and never
 * for fresh produce, where each chain codes the same thing privately, so "not carried" is
 * unverifiable and stays unknown rather than claiming a store lacks what it sells.
 */
export function missingStores(matchedByEan: boolean, leadAisle: Aisle, answered: Iterable<RetailerSlug>, offered: Offer[]): Store[] {
  if (!matchedByEan || leadAisle === "produce") return [];
  const have = new Set(offered.map((o) => o.store));
  return [...answered].map((s) => STORE_BY_SLUG[s]).filter((s) => !have.has(s));
}
