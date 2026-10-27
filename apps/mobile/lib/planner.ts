import { apiBase } from "./api";
import { sessionId } from "./session";
import type { ListItem, Store } from "./market";

// Wire types for POST /api/plan (see packages/core/src/optimizer/types.ts). Keep in sync.
export type RetailerSlug = "d1" | "jumbo" | "exito";
export const STORE_NAME: Record<RetailerSlug, Store> = { d1: "D1", jumbo: "Jumbo", exito: "Éxito" };

export type Candidate = {
  listingId: string; retailer: RetailerSlug; name: string; brand: string | null; price: number;
  size: { amount: number; unit: "g" | "ml" | "unit" } | null;
  url: string; source: string; observedAt: string; priceStatus: "live" | "snapshot" | "reported";
  isLiteralMatch: boolean; isSubstitute: boolean;
};
export type PlanLine = { itemId: string; label: string; candidate: Candidate; packs: number; lineTotal: number; isSubstitute: boolean; reason: string };
export type StorePlan = { retailer: RetailerSlug; lines: PlanLine[]; subtotal: number };
export type Alternative = { stops: number; retailers: RetailerSlug[]; total: number; difference: number; recommended: boolean };
export type Plan = {
  stores: StorePlan[]; total: number; stops: number; tripCost: number; budget: number;
  remaining: number; overBudget: number;
  unavailable: { itemId: string; label: string; reason: string }[];
  droppedItemIds: string[];
  baseline: { retailer: RetailerSlug; total: number; itemIds: string[]; description: string } | null;
  savings: number | null;
  alternatives: Alternative[];
};
export type Tradeoff = { key: string; kind: "add-stop" | "allow-brand" | "smaller-amount" | "drop"; itemId: string | null; title: string; saving: number };
export type VerifyProgress = { type: "progress"; store: RetailerSlug; checked: number; total: number; changed: number; failed: boolean };
export type PlanResult = { basketId: string; listId: string; plan: Plan; variants: Plan[]; tradeoffs: Tradeoff[]; checkedAt: string };

type PlanEvent =
  | { type: "list"; listId: string }
  | VerifyProgress
  | { type: "plan"; basketId: string; listId: string; plan: Plan; variants?: Plan[]; tradeoffs: Tradeoff[] }
  | { type: "error"; error: string };


/** What one more store stop costs the person (transport, time), in COP: the planner only adds a stop that saves more. */
export const TRIP_COSTS = [0, 5000, 10000, 15000, 20000];

/** Sent as the budget when the person has none: the API's ceiling. Screens never show it. */
export const NO_BUDGET = 10_000_000;

/** What the last plan found for one list item, by item name (the plan labels lines with it). */
export type ItemStatus =
  | { kind: "priced"; lineTotal: number; store: RetailerSlug; live: boolean; substitute: boolean }
  | { kind: "missing"; reason: string };

export const statusKey = (name: string) => name.trim().toLowerCase();

export function itemStatuses(plan: Plan): Record<string, ItemStatus> {
  const out: Record<string, ItemStatus> = {};
  for (const s of plan.stores) {
    for (const l of s.lines) {
      out[statusKey(l.label)] = { kind: "priced", lineTotal: l.lineTotal, store: s.retailer, live: l.candidate.priceStatus === "live", substitute: l.isSubstitute };
    }
  }
  for (const u of plan.unavailable) out[statusKey(u.label)] = { kind: "missing", reason: u.reason };
  return out;
}

export type PlanRequest =
  | { listId: string }
  | { budget: number; area?: string; tripCost?: number; items: ListItem[] };

export function createPlan(body: PlanRequest, onProgress: (p: VerifyProgress) => void, signal?: AbortSignal) {
  return stream(`${apiBase()}/api/plan`, body, onProgress, signal);
}

export function decideTradeoff(basketId: string, key: string, decision: "accept" | "reject", onProgress: (p: VerifyProgress) => void, signal?: AbortSignal) {
  const url = `${apiBase()}/api/plan/${encodeURIComponent(basketId)}/tradeoffs/${encodeURIComponent(key)}`;
  return stream(url, { decision }, onProgress, signal);
}

/** POST, then read NDJSON events. Falls back to reading the whole body where streaming isn't supported (native fetch). */
async function stream(url: string, body: unknown, onProgress: (p: VerifyProgress) => void, signal?: AbortSignal): Promise<PlanResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Rinde-Session": await sessionId() },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "No pudimos armar el plan. Intenta de nuevo.");
  }

  let result: PlanResult | undefined;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as PlanEvent;
    if (event.type === "progress") onProgress(event);
    else if (event.type === "error") throw new Error(event.error);
    else if (event.type === "plan") {
      result = { basketId: event.basketId, listId: event.listId, plan: event.plan, variants: event.variants ?? [], tradeoffs: event.tradeoffs, checkedAt: new Date().toISOString() };
    }
  };

  const reader = response.body?.getReader?.();
  if (reader) {
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer);
  } else {
    (await response.text()).split("\n").forEach(handle);
  }
  if (!result) throw new Error("No pudimos armar el plan. Intenta de nuevo.");
  return result;
}

export function packLabel(c: Candidate) {
  if (!c.size) return "";
  const { amount, unit } = c.size;
  if (unit === "g") return amount >= 1000 ? `${trim(amount / 1000)} kg` : `${trim(amount)} g`;
  if (unit === "ml") return amount >= 1000 ? `${trim(amount / 1000)} L` : `${trim(amount)} ml`;
  return `${trim(amount)} und`;
}

function trim(n: number) {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/** "Verificado ahora" / "Precio de catálogo, hace 3 h" — the provenance shown on every line. */
export function provenance(c: Candidate, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(c.observedAt).getTime()) / 60000));
  const age = mins < 1 ? "ahora" : mins < 60 ? `hace ${mins} min` : `hace ${Math.floor(mins / 60)} h`;
  if (c.priceStatus === "reported") return `Reportado en tienda · factura · ${age}; no verificado en línea`;
  return c.priceStatus === "live" ? `Verificado en ${STORE_NAME[c.retailer]} ${age}` : `Precio de catálogo de ${STORE_NAME[c.retailer]}, ${age}`;
}
