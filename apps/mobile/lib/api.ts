import { Platform } from "react-native";
import type { ListItem, LookupResult, Store } from "./market";
import type { CatalogResult } from "./shop";

// The PWA calls relative /api/* routes on its own host. On native there is no
// same-origin server, so the backend base URL is explicit. Point it at a
// running Rinde backend (Dyad PWA dev server or deployed URL):
//   EXPO_PUBLIC_API_URL=http://192.168.1.10:3000 npx expo start
const BASE = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");

async function parse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "No pudimos consultar los precios.");
  return data;
}

export function apiBase() {
  return BASE;
}

export function fetchPrices(area: string, items: ListItem[], signal?: AbortSignal): Promise<LookupResult> {
  return fetch(`${BASE}/api/prices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area, items }),
    signal,
  }).then(parse) as Promise<LookupResult>;
}

export function fetchCatalog(term: string, store?: Store | "all", signal?: AbortSignal): Promise<CatalogResult> {
  const params = new URLSearchParams({ query: term });
  if (store && store !== "all") params.set("store", store);
  return fetch(`${BASE}/api/catalog?${params}`, { signal }).then(parse) as Promise<CatalogResult>;
}

/** A photographed shopping list → list items (Meta Muse vision; never prices). On web the picker gives a File. */
export function extractPhoto(photo: { uri: string; mimeType: string; file?: File | null }): Promise<{ items: ListItem[] }> {
  const data = new FormData();
  if (Platform.OS === "web" && photo.file) data.append("photo", photo.file, "lista.jpg");
  else data.append("photo", { uri: photo.uri, type: photo.mimeType, name: "lista.jpg" } as unknown as Blob);
  return fetch(`${BASE}/api/extract`, { method: "POST", body: data }).then(parse) as Promise<{ items: ListItem[] }>;
}

/** One store's observed price for a listing on one day (see apps/web/src/server/history.ts). */
export type HistoryPoint = { listingId: string; store: Store; day: string; price: number; source: "online" | "receipt" };

export function fetchHistory(listingIds: string[], signal?: AbortSignal): Promise<{ days: number; points: HistoryPoint[] }> {
  const ids = encodeURIComponent(listingIds.slice(0, 6).join(","));
  return fetch(`${BASE}/api/history?ids=${ids}`, { signal }).then(parse) as Promise<{ days: number; points: HistoryPoint[] }>;
}
