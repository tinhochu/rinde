import { optimize, type Candidate, type Plan, type PlanItem, type PlanOptions, type RetailerSlug } from "@rinde/core";

/** Snapshot prices older than this cannot be used without a successful live check. */
export const MAX_SNAPSHOT_AGE_MS = 36 * 60 * 60 * 1000;
export const VERIFY_BUDGET_MS = 20_000;
const MAX_ROUNDS = 2;

/** A fresh observation for a listing; null means the retailer reports it unavailable or gone. */
export type LiveResult = { price: number; observedAt: string; observationId: string } | null;

export interface VerifyDeps {
  /** Re-fetch listings at one retailer (batched), record observations, return results by listingId. */
  fetchLive(retailer: RetailerSlug, listingIds: string[], signal: AbortSignal): Promise<Map<string, LiveResult>>;
  now?: () => number;
}

export interface VerifyProgress {
  type: "progress";
  store: RetailerSlug;
  checked: number;
  total: number;
  changed: number;
  failed: boolean;
}

export interface VerifiedPlan {
  plan: Plan;
  items: PlanItem[];
  rounds: number;
}

/**
 * optimize → verify chosen listings live → re-optimize if anything changed (≤ 2 rounds).
 * Only chosen listings are checked; the whole step is bounded by VERIFY_BUDGET_MS.
 */
export async function planAndVerify(
  items: PlanItem[], options: PlanOptions, deps: VerifyDeps,
  opts: { signal?: AbortSignal; onProgress?: (p: VerifyProgress) => void } = {},
): Promise<VerifiedPlan> {
  const signal = opts.signal ?? AbortSignal.timeout(VERIFY_BUDGET_MS);
  const verified = new Set<string>();
  let current = items;
  let plan = optimize(current, options);
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds++;
    const result = await verifyPlan(plan, current, deps, { signal, onProgress: opts.onProgress, skip: verified });
    current = result.items;
    for (const id of result.checked) verified.add(id);
    // Always re-plan so lines carry the verified candidate data (price, observation, status).
    plan = optimize(current, options);
    if (!result.changed) break;
    const unverified = plan.stores.flatMap((s) => s.lines).filter((l) => l.candidate.priceStatus !== "reported" && !verified.has(l.candidate.listingId));
    if (unverified.length === 0) break;
  }

  // Lines that could not be checked (failure/timeout/round limit) must still be fresh enough.
  // Receipt prices were read within their own 72 h window and are labeled unverified instead.
  const now = deps.now?.() ?? Date.now();
  const stale = plan.stores.flatMap((s) => s.lines).filter(
    (l) => l.candidate.priceStatus !== "reported" && !verified.has(l.candidate.listingId) && now - Date.parse(l.candidate.observedAt) > MAX_SNAPSHOT_AGE_MS,
  );
  if (stale.length) {
    current = removeCandidates(current, new Set(stale.map((l) => l.candidate.listingId)), "Precio desactualizado");
    plan = optimize(current, options);
  }
  return { plan, items: current, rounds };
}

/**
 * Re-check the plan's chosen listings at each store in parallel. Updates candidates with
 * live prices, removes unavailable ones, and applies the 36 h fallback when a store fails.
 */
export async function verifyPlan(
  plan: Plan, items: PlanItem[], deps: VerifyDeps,
  opts: { signal: AbortSignal; onProgress?: (p: VerifyProgress) => void; skip?: ReadonlySet<string> },
): Promise<{ items: PlanItem[]; changed: boolean; checked: string[] }> {
  const now = deps.now?.() ?? Date.now();
  const updates = new Map<string, Partial<Candidate>>();
  const removed = new Set<string>();
  const stale = new Set<string>();
  const checked: string[] = [];

  await Promise.all(
    plan.stores.map(async ({ retailer, lines }) => {
      // Receipt prices are never re-checked live (community-prices spec).
      const pending = lines.map((l) => l.candidate).filter((c) => c.priceStatus !== "reported" && !opts.skip?.has(c.listingId));
      if (pending.length === 0) return;
      let changed = 0;
      // Announced before the call, so the person sees which stores are being checked right now.
      opts.onProgress?.({ type: "progress", store: retailer, checked: 0, total: pending.length, changed: 0, failed: false });
      try {
        const live = await abortable(deps.fetchLive(retailer, pending.map((c) => c.listingId), opts.signal), opts.signal);
        for (const c of pending) {
          checked.push(c.listingId);
          const result = live.get(c.listingId) ?? null;
          if (!result) {
            removed.add(c.listingId);
            changed++;
            continue;
          }
          if (result.price !== c.price) changed++;
          updates.set(c.listingId, { ...result, priceStatus: "live" });
        }
        opts.onProgress?.({ type: "progress", store: retailer, checked: pending.length, total: pending.length, changed, failed: false });
      } catch {
        // Store unreachable or out of time: keep snapshot prices only while they are fresh.
        for (const c of pending) if (now - Date.parse(c.observedAt) > MAX_SNAPSHOT_AGE_MS) stale.add(c.listingId);
        opts.onProgress?.({ type: "progress", store: retailer, checked: 0, total: pending.length, changed: 0, failed: true });
      }
    }),
  );

  let next = items.map((item) => ({
    ...item,
    candidates: item.candidates.map((c) => (updates.has(c.listingId) ? { ...c, ...updates.get(c.listingId) } : c)),
  }));
  next = removeCandidates(next, removed, "No disponible en este momento");
  next = removeCandidates(next, stale, "Precio desactualizado");

  const priceChanged = [...updates].some(([id, u]) => findCandidate(items, id)?.price !== u.price);
  return { items: next, changed: priceChanged || removed.size > 0 || stale.size > 0, checked };
}

function removeCandidates(items: PlanItem[], ids: ReadonlySet<string>, reason: string): PlanItem[] {
  if (ids.size === 0) return items;
  return items.map((item) => {
    const kept = item.candidates.filter((c) => !ids.has(c.listingId));
    if (kept.length === item.candidates.length) return item;
    return { ...item, candidates: kept, unavailableReason: kept.length === 0 ? reason : item.unavailableReason };
  });
}

function findCandidate(items: PlanItem[], listingId: string) {
  for (const item of items) for (const c of item.candidates) if (c.listingId === listingId) return c;
  return undefined;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}
