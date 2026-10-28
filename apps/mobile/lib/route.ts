import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiBase } from "./api";
import { sessionId } from "./session";

// Wire types for GET /api/branches and POST /api/route-plan (apps/web/src/server/route-plan.ts). Keep in sync.

export type Chain = "d1" | "jumbo" | "exito" | "carulla";
export type TravelMode = "walk" | "bus" | "moto" | "car";
export type LatLon = [number, number];

export const CHAIN_NAMES: Record<Chain, string> = { d1: "D1", jumbo: "Jumbo", exito: "Éxito", carulla: "Carulla" };
export const MODE_LABELS: Record<TravelMode, string> = { walk: "A pie", bus: "Bus o TM", moto: "Moto", car: "Carro" };

export interface Branch {
  id: string;
  chain: Chain;
  name: string;
  address: string | null;
  area: string | null;
  lat: number;
  lon: number;
  /** Route distance and time from the person, when they shared their location */
  distanceM?: number;
  durationS?: number;
}

export interface TravelCosts {
  busFare: number;
  motoPerKm: number;
  carPerKm: number;
  parking: number;
}
export const DEFAULT_COSTS: TravelCosts = { busFare: 3200, motoPerKm: 250, carPerKm: 600, parking: 3000 };

export interface RouteStop { chain: Chain; name: string; address: string | null; area: string | null; lat: number; lon: number; branchId: string | null }
export interface RouteLine { itemId: string; label: string; product: string; packs: number; lineTotal: number; cold: boolean; heavy: boolean }
export interface RouteLeg { to: string; distance: string; minutes: string; steps: string[] }
export interface RouteGeometry { distance: string; minutes: string; coordinates: LatLon[]; legs: RouteLeg[]; from: LatLon }
export interface RouteOption {
  key: string;
  label: string;
  stops: RouteStop[];
  stopLines: RouteLine[][];
  goodsTotal: number;
  saving: number;
  extraDistance: string;
  extraMinutes: string;
  travelCost: number;
  net: number;
  extraItems: string[];
  route: RouteGeometry | null;
}

export type RoutePlanEvent =
  | { type: "options"; options: RouteOption[]; leftOut: { chain: Chain; reason: string }[]; startDropped: boolean; busEstimate: boolean }
  | { type: "question"; question: string; choice: number; explanation: string }
  | { type: "advice"; choice: number; explanation: string; source: "muse" | "rule"; foregone: { label: string; net: number } | null; stopLines: RouteLine[][] }
  | { type: "verified"; choice: number; goodsTotal: number; saving: number; net: number; stopLines: RouteLine[][]; checked: number }
  | { type: "error"; error: string };

export type Anchor = { branchId: string } | { chain: Chain; lat: number; lon: number } | { chain: Chain; address: string };

export interface RoutePlanRequest {
  listId: string;
  anchor: Anchor;
  start: { lat: number; lon: number } | null;
  travel: { mode: TravelMode } & TravelCosts;
  note: string;
  answer?: string;
}

async function parse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "No pudimos buscar las tiendas.");
  return data;
}

export function fetchBranches(
  query: { q: string; chain?: Chain } | { near: LatLon; chain?: Chain; mode: TravelMode },
  signal?: AbortSignal,
): Promise<{ branches: Branch[]; routed: boolean }> {
  const params = new URLSearchParams();
  if ("q" in query) params.set("q", query.q);
  else { params.set("near", query.near.join(",")); params.set("mode", query.mode); }
  if (query.chain) params.set("chain", query.chain);
  return fetch(`${apiBase()}/api/branches?${params.toString()}`, { signal }).then(parse);
}

/** POST, then hand each NDJSON event over as it arrives (whole body where the platform can't stream). */
export async function streamRoutePlan(body: RoutePlanRequest, onEvent: (e: RoutePlanEvent) => void, signal?: AbortSignal) {
  const response = await fetch(`${apiBase()}/api/route-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Rinde-Session": await sessionId() },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "No pudimos armar la ruta. Intenta de nuevo.");
  }
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as RoutePlanEvent;
    if (event.type === "error") throw new Error(event.error);
    onEvent(event);
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
}

const TRAVEL_KEY = "rinde-travel";

export interface TravelPrefs extends TravelCosts {
  mode: TravelMode;
}

/** The person's mode and costs, kept on this device. */
export async function loadTravel(): Promise<TravelPrefs> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(TRAVEL_KEY)) || "null") as Partial<TravelPrefs> | null;
    const mode = saved?.mode && saved.mode in MODE_LABELS ? saved.mode : "walk";
    const num = (k: keyof TravelCosts) => (typeof saved?.[k] === "number" && saved[k]! >= 0 ? saved[k]! : DEFAULT_COSTS[k]);
    return { mode, busFare: num("busFare"), motoPerKm: num("motoPerKm"), carPerKm: num("carPerKm"), parking: num("parking") };
  } catch {
    return { mode: "walk", ...DEFAULT_COSTS };
  }
}

export async function saveTravel(prefs: TravelPrefs) {
  try {
    await AsyncStorage.setItem(TRAVEL_KEY, JSON.stringify(prefs));
  } catch {
    // The plan works with the costs in memory; they just won't be remembered.
  }
}

export function formatKm(m: number) {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(Math.round(m / 100) / 10).toString().replace(".", ",")} km`;
}

export function formatMin(s: number) {
  return `${Math.max(1, Math.round(s / 60))} min`;
}
