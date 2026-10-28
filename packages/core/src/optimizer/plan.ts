import { packsNeeded } from "../units";
import type {
  Alternative, Baseline, Candidate, Plan, PlanItem, PlanLine, PlanOptions, RetailerSlug, StorePlan, Unavailable,
} from "./types";

export const DEFAULT_TRIP_COST = 10_000;
export const STORE_ORDER: RetailerSlug[] = ["d1", "jumbo", "exito", "carulla"];
export const STORE_NAMES: Record<RetailerSlug, string> = { d1: "D1", jumbo: "Jumbo", exito: "Éxito", carulla: "Carulla" };

const cop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const formatCop = (n: number) => `$${cop.format(Math.round(n))}`;

interface Choice {
  candidate: Candidate;
  packs: number;
  lineTotal: number;
}

/**
 * Whether a candidate can satisfy the item's quantity. Items counted in units ("1 und de
 * galletas") accept any package — one package per unit — since the size wasn't specified.
 */
export function unitCompatible(item: PlanItem, c: Candidate): boolean {
  return c.price > 0 && c.size !== null && c.size.amount > 0 && (c.size.unit === item.unit || item.unit === "unit");
}

/** Candidates the item allows: usable size of a compatible unit kind, substitution rule, pinned listing. */
export function acceptableCandidates(item: PlanItem): Candidate[] {
  const usable = item.candidates.filter((c) => unitCompatible(item, c));
  if (item.pinnedListingId) {
    const pinned = usable.filter((c) => c.listingId === item.pinnedListingId);
    if (pinned.length) return pinned;
  }
  return item.allowSubstitute ? usable : usable.filter((c) => c.isLiteralMatch);
}

function choose(candidate: Candidate, item: PlanItem): Choice {
  const packs = candidate.size!.unit === item.unit ? packsNeeded(item.quantity, candidate.size!) : Math.max(1, Math.ceil(item.quantity));
  return { candidate, packs, lineTotal: packs * candidate.price };
}

function compareChoices(a: Choice, b: Choice): number {
  return (
    a.lineTotal - b.lineTotal ||
    STORE_ORDER.indexOf(a.candidate.retailer) - STORE_ORDER.indexOf(b.candidate.retailer) ||
    a.candidate.listingId.localeCompare(b.candidate.listingId)
  );
}

/** Cheapest choice for an item among the given stores (deterministic tie-breaks). */
export function bestChoice(candidates: Candidate[], item: PlanItem, stores: ReadonlySet<RetailerSlug>): Choice | null {
  let best: Choice | null = null;
  for (const c of candidates) {
    if (!stores.has(c.retailer)) continue;
    const choice = choose(c, item);
    if (!best || compareChoices(choice, best) < 0) best = choice;
  }
  return best;
}

function subsets<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << values.length; mask++) out.push(values.filter((_, i) => mask & (1 << i)));
  return out;
}

interface Assignment {
  stores: RetailerSlug[];
  choices: Map<string, Choice>;
  goods: number;
}

function storeKey(stores: RetailerSlug[]) {
  return [...stores].sort((a, b) => STORE_ORDER.indexOf(a) - STORE_ORDER.indexOf(b)).join("+");
}

/**
 * Turn a shopping list into a multi-store purchase plan.
 *
 * Exact for this problem: once a set of stores is fixed, items are independent, so the
 * per-item minimum is optimal; every non-empty store set is tried (≤ 15 for 4 stores).
 * The recommended plan minimizes goods total + tripCost × (stores used − 1).
 */
export function optimize(items: PlanItem[], options: PlanOptions): Plan {
  const tripCost = options.tripCost ?? DEFAULT_TRIP_COST;
  const retailers = STORE_ORDER.filter((r) => options.retailers.includes(r));
  const enabled = new Set(retailers);

  const active = items.filter((i) => !i.dropped);
  const acceptable = new Map(active.map((i) => [i.id, acceptableCandidates(i).filter((c) => enabled.has(c.retailer))]));
  const coverable = active.filter((i) => acceptable.get(i.id)!.length > 0);
  const unavailable: Unavailable[] = active
    .filter((i) => acceptable.get(i.id)!.length === 0)
    .map((i) => ({ itemId: i.id, label: i.label, reason: unavailableReason(i, enabled) }));

  // Best assignment per set of stores actually used (subsets that collapse are deduplicated).
  const byUsedStores = new Map<string, Assignment>();
  for (const subset of subsets(retailers)) {
    const allowed = new Set(subset);
    const choices = new Map<string, Choice>();
    let feasible = true;
    for (const item of coverable) {
      const choice = bestChoice(acceptable.get(item.id)!, item, allowed);
      if (!choice) { feasible = false; break; }
      choices.set(item.id, choice);
    }
    if (!feasible) continue;
    const used = STORE_ORDER.filter((r) => [...choices.values()].some((c) => c.candidate.retailer === r));
    const goods = sum([...choices.values()].map((c) => c.lineTotal));
    const key = storeKey(used);
    const existing = byUsedStores.get(key);
    if (!existing || goods < existing.goods) byUsedStores.set(key, { stores: used, choices, goods });
  }

  const assignments = [...byUsedStores.values()];
  const cost = (a: Assignment) => a.goods + tripCost * Math.max(0, a.stores.length - 1);
  const ranked = assignments.sort(
    (a, b) => cost(a) - cost(b) || a.stores.length - b.stores.length || a.goods - b.goods || storeKey(a.stores).localeCompare(storeKey(b.stores)),
  );
  const forcedKey = options.forceStores?.length ? storeKey(options.forceStores.filter((r) => enabled.has(r))) : null;
  const recommended: Assignment =
    (forcedKey && ranked.find((a) => storeKey(a.stores) === forcedKey)) || ranked[0] || { stores: [], choices: new Map(), goods: 0 };

  const lines = coverable.map((item): PlanLine => {
    const choice = recommended.choices.get(item.id)!;
    return {
      itemId: item.id,
      label: item.label,
      candidate: choice.candidate,
      packs: choice.packs,
      lineTotal: choice.lineTotal,
      isSubstitute: choice.candidate.isSubstitute,
      reason: lineReason(item, choice, acceptable.get(item.id)!, enabled, recommended.stores) + reportedNote(choice.candidate, options.now ?? Date.now()),
    };
  });

  const stores: StorePlan[] = recommended.stores
    .map((retailer) => {
      const storeLines = lines.filter((l) => l.candidate.retailer === retailer);
      return { retailer, lines: storeLines, subtotal: sum(storeLines.map((l) => l.lineTotal)) };
    })
    .sort((a, b) => b.lines.length - a.lines.length || STORE_ORDER.indexOf(a.retailer) - STORE_ORDER.indexOf(b.retailer));

  const total = recommended.goods;
  const baseline = computeBaseline(coverable, retailers);
  const savings = baseline
    ? baseline.total - sum(lines.filter((l) => baseline.itemIds.includes(l.itemId)).map((l) => l.lineTotal))
    : null;

  return {
    stores,
    total,
    stops: recommended.stores.length,
    tripCost,
    budget: options.budget,
    remaining: options.budget - total,
    overBudget: Math.max(0, total - options.budget),
    unavailable,
    droppedItemIds: items.filter((i) => i.dropped).map((i) => i.id),
    baseline,
    savings,
    alternatives: alternativesByStops(assignments, recommended),
  };
}

/** Best plan (lowest goods total) for each number of stops. */
function alternativesByStops(assignments: Assignment[], recommended: Assignment): Alternative[] {
  const best = new Map<number, Assignment>();
  for (const a of assignments) {
    const current = best.get(a.stores.length);
    if (!current || a.goods < current.goods) best.set(a.stores.length, a);
  }
  return [...best.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stops, a]) => ({
      stops,
      retailers: a.stores,
      total: a.goods,
      difference: a.goods - recommended.goods,
      recommended: storeKey(a.stores) === storeKey(recommended.stores),
    }));
}

/**
 * Baseline: everything at one store, the closest literal match for each item, no substitutions.
 * The store covering the most items literally wins (then the lowest total), so the comparison
 * spans as many items as possible; items it can't cover are excluded from both sides.
 */
function computeBaseline(items: PlanItem[], retailers: RetailerSlug[]): Baseline | null {
  let best: Baseline | null = null;
  for (const retailer of retailers) {
    const only = new Set([retailer]);
    const itemIds: string[] = [];
    let total = 0;
    for (const item of items) {
      const literal = item.candidates.filter((c) => c.isLiteralMatch && unitCompatible(item, c));
      const choice = bestChoice(literal, item, only);
      if (!choice) continue;
      itemIds.push(item.id);
      total += choice.lineTotal;
    }
    if (itemIds.length === 0) continue;
    if (!best || itemIds.length > best.itemIds.length || (itemIds.length === best.itemIds.length && total < best.total)) {
      const coverage = itemIds.length === items.length ? "" : ` (${itemIds.length} de ${items.length} productos)`;
      best = {
        retailer,
        total,
        itemIds,
        description: `Comparado con comprar todo en ${STORE_NAMES[retailer]}, sin cambios de marca${coverage}`,
      };
    }
  }
  return best;
}

function lineReason(
  item: PlanItem, choice: Choice, acceptable: Candidate[], enabled: ReadonlySet<RetailerSlug>, planStores: RetailerSlug[],
): string {
  const chosenStore = choice.candidate.retailer;
  let alternative: Choice | null = null;
  for (const retailer of enabled) {
    if (retailer === chosenStore) continue;
    const other = bestChoice(acceptable, item, new Set([retailer]));
    if (other && (!alternative || compareChoices(other, alternative) < 0)) alternative = other;
  }

  let reason: string;
  if (!alternative) {
    reason = `Solo disponible en ${STORE_NAMES[chosenStore]}`;
  } else {
    const diff = alternative.lineTotal - choice.lineTotal;
    const where = STORE_NAMES[alternative.candidate.retailer];
    if (diff > 0) reason = `${formatCop(diff)} más barato que en ${where}`;
    else if (diff === 0) reason = `Mismo precio que en ${where}`;
    else if (!planStores.includes(alternative.candidate.retailer))
      reason = `${formatCop(-diff)} más caro que en ${where}, pero te ahorras esa parada`;
    else reason = `${formatCop(-diff)} más caro que en ${where}`;
  }

  if (choice.candidate.isSubstitute) {
    const literal = bestChoice(acceptable.filter((c) => c.isLiteralMatch), item, enabled);
    if (literal && literal.lineTotal > choice.lineTotal)
      reason += `. Reemplaza a ${literal.candidate.name} (${formatCop(literal.lineTotal - choice.lineTotal)} menos)`;
  }
  return reason;
}

/** Receipt prices say where they come from, since nobody checked them online. */
function reportedNote(c: Candidate, now: number): string {
  if (c.priceStatus !== "reported") return "";
  const hours = Math.max(0, Math.floor((now - Date.parse(c.observedAt)) / 3_600_000));
  return `. Precio reportado en factura hace ${hours} h; no verificado en línea`;
}

function unavailableReason(item: PlanItem, enabled: ReadonlySet<RetailerSlug>): string {
  if (item.unavailableReason) return item.unavailableReason;
  const inStores = item.candidates.filter((c) => enabled.has(c.retailer));
  if (inStores.length === 0) return "No disponible en ninguna tienda";
  if (!inStores.some((c) => unitCompatible(item, c))) return "No encontramos presentaciones con esa medida";
  if (!item.allowSubstitute && !inStores.some((c) => c.isLiteralMatch)) return "No encontramos esa marca; permite cambiarla para ver opciones";
  return "No disponible en ninguna tienda";
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}
