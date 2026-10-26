import { acceptableCandidates, formatCop, optimize, STORE_NAMES, STORE_ORDER } from "./plan";
import type { Plan, PlanItem, PlanOptions, RetailerSlug } from "./types";

export type TradeoffKind = "add-stop" | "allow-brand" | "smaller-amount" | "drop";

export type TradeoffChange =
  | { kind: "add-stop"; stores: RetailerSlug[] }
  | { kind: "allow-brand"; itemId: string }
  | { kind: "smaller-amount"; itemId: string; quantity: number }
  | { kind: "drop"; itemId: string };

export interface Tradeoff {
  /** Stable id, used to remember rejections, e.g. "drop:galletas" */
  key: string;
  kind: TradeoffKind;
  itemId: string | null;
  /** Plain-language proposal; every amount in it comes from the computed saving */
  title: string;
  /** COP saved compared with the current plan (always > 0) */
  saving: number;
  change: TradeoffChange;
}

const MAX_PROPOSALS = 5;
// Proposals that keep every item at full quantity come first, then smaller amounts, then drops.
const SACRIFICE: Record<TradeoffKind, number> = { "add-stop": 0, "allow-brand": 0, "smaller-amount": 1, drop: 2 };

/** Apply an accepted trade-off to the list and plan options. Pure: returns new values. */
export function applyTradeoff(items: PlanItem[], options: PlanOptions, change: TradeoffChange): { items: PlanItem[]; options: PlanOptions } {
  switch (change.kind) {
    case "add-stop":
      return { items, options: { ...options, forceStores: change.stores } };
    case "allow-brand":
      return { items: items.map((i) => (i.id === change.itemId ? { ...i, allowSubstitute: true } : i)), options };
    case "smaller-amount":
      return { items: items.map((i) => (i.id === change.itemId ? { ...i, quantity: change.quantity } : i)), options };
    case "drop":
      return { items: items.map((i) => (i.id === change.itemId ? { ...i, dropped: true } : i)), options };
  }
}

/**
 * Over-budget trade-offs, ranked by sacrifice then saving. Each saving is measured by
 * re-running the optimizer with the change applied, so store-selection effects count.
 */
export function proposeTradeoffs(
  items: PlanItem[], options: PlanOptions, plan: Plan = optimize(items, options), rejected: ReadonlySet<string> = new Set(),
): Tradeoff[] {
  if (plan.overBudget <= 0) return [];

  const drafts: Array<Omit<Tradeoff, "saving" | "title"> & { title: (saving: string) => string }> = [];
  const lineByItem = new Map(plan.stores.flatMap((s) => s.lines).map((l) => [l.itemId, l]));

  for (const alt of plan.alternatives) {
    if (alt.difference >= 0 || alt.recommended) continue;
    const added = alt.retailers.filter((r) => !plan.stores.some((s) => s.retailer === r));
    if (added.length === 0) continue;
    drafts.push({
      key: `add-stop:${alt.retailers.join("+")}`,
      kind: "add-stop",
      itemId: null,
      change: { kind: "add-stop", stores: alt.retailers },
      title: (saving) => `Ir también a ${listStores(added)}: ahorras ${saving}`,
    });
  }

  for (const item of items) {
    if (item.dropped) continue;
    const line = lineByItem.get(item.id);

    if (!item.allowSubstitute && item.candidates.some((c) => c.isSubstitute)) {
      drafts.push({
        key: `allow-brand:${item.id}`,
        kind: "allow-brand",
        itemId: item.id,
        change: { kind: "allow-brand", itemId: item.id },
        title: (saving) => `¿Aceptas otra marca de ${item.label}? Ahorras ${saving}`,
      });
    }

    if (item.essential || !line) continue;

    const smaller = smallerQuantity(item, line.packs, line.candidate.size!.amount);
    if (smaller !== null) {
      drafts.push({
        key: `smaller-amount:${item.id}:${smaller}`,
        kind: "smaller-amount",
        itemId: item.id,
        change: { kind: "smaller-amount", itemId: item.id, quantity: smaller },
        title: (saving) => `Llevar ${amountLabel(smaller, item)} de ${item.label} en vez de ${amountLabel(item.quantity, item)}: ahorras ${saving}`,
      });
    }

    drafts.push({
      key: `drop:${item.id}`,
      kind: "drop",
      itemId: item.id,
      change: { kind: "drop", itemId: item.id },
      title: (saving) => `Quitar ${item.label} de la lista: ahorras ${saving}`,
    });
  }

  const proposals: Tradeoff[] = [];
  for (const draft of drafts) {
    if (rejected.has(draft.key)) continue;
    const next = applyTradeoff(items, options, draft.change);
    const saving = plan.total - optimize(next.items, next.options).total;
    if (saving <= 0) continue;
    proposals.push({ ...draft, saving, title: draft.title(formatCop(saving)) });
  }

  return proposals
    .sort((a, b) => SACRIFICE[a.kind] - SACRIFICE[b.kind] || b.saving - a.saving || a.key.localeCompare(b.key))
    .slice(0, MAX_PROPOSALS);
}

/** One pack fewer, or else the largest available presentation below the requested amount. */
function smallerQuantity(item: PlanItem, packs: number, packSize: number): number | null {
  if (packs > 1) return (packs - 1) * packSize;
  const sizes = acceptableCandidates(item)
    .map((c) => c.size!.amount)
    .filter((amount) => amount < item.quantity);
  return sizes.length ? Math.max(...sizes) : null;
}

function amountLabel(quantity: number, item: PlanItem) {
  if (item.unit === "g") return quantity >= 1000 ? `${trim(quantity / 1000)} kg` : `${trim(quantity)} g`;
  if (item.unit === "ml") return quantity >= 1000 ? `${trim(quantity / 1000)} L` : `${trim(quantity)} ml`;
  return `${trim(quantity)} und`;
}

function trim(n: number) {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function listStores(stores: RetailerSlug[]) {
  const names = [...stores].sort((a, b) => STORE_ORDER.indexOf(a) - STORE_ORDER.indexOf(b)).map((s) => STORE_NAMES[s]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : names[0]!;
}
