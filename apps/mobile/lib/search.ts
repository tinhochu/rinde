import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchCatalog } from "./api";
import { STORES, normalized, type Aisle, type Store } from "./market";
import type { CatalogResult } from "./shop";

/** Searches people run most. Words only: prices appear once a search runs. */
export const POPULAR = ["leche", "arroz", "huevos", "aceite", "café", "pollo", "papa", "azúcar", "pan", "atún"];

export type SearchSort = "relevant" | "price" | "stores";

/** Everything about a search lives in the URL, so Back, Forward and a reload all land on the same results. */
export type SearchState = {
  q: string; stores: Store[]; aisle: Aisle | "all"; sort: SearchSort; brands: string[]; multi: boolean;
};

type RawParams = Partial<Record<"q" | "stores" | "aisle" | "sort" | "brands" | "multi", string | string[]>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) => one(v).split(",").map(s => s.trim()).filter(Boolean);

export function readSearch(params: RawParams): SearchState {
  const sort = one(params.sort);
  return {
    q: one(params.q).trim().slice(0, 100),
    stores: list(params.stores).filter((s): s is Store => (STORES as string[]).includes(s)),
    aisle: (one(params.aisle) || "all") as Aisle | "all",
    sort: sort === "price" || sort === "stores" ? sort : "relevant",
    brands: list(params.brands),
    multi: one(params.multi) === "1",
  };
}

/** URL params for a search; defaults are left out so links stay short. Undefined clears a param. */
export function searchParams(s: Partial<SearchState>) {
  return {
    q: s.q,
    stores: s.stores?.length ? s.stores.join(",") : undefined,
    aisle: s.aisle && s.aisle !== "all" ? s.aisle : undefined,
    sort: s.sort && s.sort !== "relevant" ? s.sort : undefined,
    brands: s.brands?.length ? s.brands.join(",") : undefined,
    multi: s.multi ? "1" : undefined,
  };
}

/** A link to the results screen, e.g. from the home search or a category. */
export function searchHref(q: string, extra: Partial<SearchState> = {}) {
  const params = Object.entries(searchParams({ ...extra, q })).filter(([, v]) => v !== undefined) as [string, string][];
  return `/search?${new URLSearchParams(params).toString()}`;
}

// ── Results: one request per query, kept briefly so filters, Back and return visits never re-fetch ──

const FRESH_MS = 5 * 60000;
const cache = new Map<string, { data: CatalogResult; at: number }>();

export function useCatalog(q: string) {
  const key = normalized(q);
  const cached = cache.get(key);
  const [state, setState] = useState<{ key: string; data?: CatalogResult; error?: string; loading: boolean }>(() =>
    cached && Date.now() - cached.at < FRESH_MS ? { key, data: cached.data, loading: false } : { key, loading: q.length >= 2 });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (q.length < 2) { setState({ key, loading: false }); return; }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS && nonce === 0) { setState({ key, data: hit.data, loading: false }); return; }
    const controller = new AbortController();
    // Stale answers for an earlier query are dropped by the abort; the key check guards the rest.
    setState({ key, loading: true });
    fetchCatalog(q, "all", controller.signal)
      .then(data => {
        cache.set(key, { data, at: Date.now() });
        if (!controller.signal.aborted) setState({ key, data, loading: false });
      })
      .catch(e => {
        if (!controller.signal.aborted) setState({ key, loading: false, error: e instanceof Error ? e.message : "No hay conexión con el catálogo." });
      });
    return () => controller.abort();
  }, [key, q, nonce]);

  const retry = useCallback(() => { cache.delete(key); setNonce(n => n + 1); }, [key]);
  const current = state.key === key ? state : { key, loading: true };
  return { ...current, retry };
}

// ── Recent searches, on this device only ──

const RECENT = "rinde-searches";
const MAX_RECENT = 8;

export async function recentSearches(): Promise<string[]> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(RECENT)) || "[]");
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export async function rememberSearch(term: string) {
  const clean = term.trim();
  if (clean.length < 2) return;
  const next = [clean, ...(await recentSearches()).filter(s => normalized(s) !== normalized(clean))].slice(0, MAX_RECENT);
  await AsyncStorage.setItem(RECENT, JSON.stringify(next)).catch(() => undefined);
}

export async function forgetSearch(term: string) {
  const next = (await recentSearches()).filter(s => normalized(s) !== normalized(term));
  await AsyncStorage.setItem(RECENT, JSON.stringify(next)).catch(() => undefined);
  return next;
}

/** While typing: recent searches first, then popular ones, both matched on any word start. */
export function suggestionsFor(text: string, recent: string[]) {
  const t = normalized(text.trim());
  const match = (s: string) => !t || normalized(s).split(/\s+/).some(w => w.startsWith(t)) || normalized(s).startsWith(t);
  const fromRecent = recent.filter(match);
  const fromPopular = POPULAR.filter(p => match(p) && !fromRecent.some(r => normalized(r) === normalized(p)));
  return { recent: fromRecent.slice(0, 6), popular: fromPopular.slice(0, t ? 6 : 8) };
}
