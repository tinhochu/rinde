/**
 * Street routes for route plans. Every distance and time a plan shows comes from here, never from a
 * straight line. The first provider is the FOSSGIS public OSRM (routing.openstreetmap.de, no key);
 * a self-hosted OSRM or a paid provider can replace it behind `RouteProvider`.
 */

/** Latitude and longitude, in that order. */
export type LatLon = [number, number];
export type RouteProfile = "foot" | "car";

/** One OSRM maneuver: what to do, where, and how far until the next one. */
export interface RouteStep {
  type: string;
  modifier: string | null;
  /** Street name, empty when the way has none */
  name: string;
  /** Roundabout exit number, when the maneuver is a roundabout */
  exit: number | null;
  distanceM: number;
  durationS: number;
}

export interface RouteLeg {
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
}

export interface Route {
  distanceM: number;
  durationS: number;
  legs: RouteLeg[];
  /** The line along the streets, [lat, lon] */
  coordinates: LatLon[];
}

export interface RouteTable {
  /** durationsS[source][destination]; null when there's no route */
  durationsS: (number | null)[][];
  distancesM: (number | null)[][];
}

export interface RouteProvider {
  route(points: LatLon[], profile: RouteProfile): Promise<Route>;
  table(sources: LatLon[], destinations: LatLon[], profile: RouteProfile): Promise<RouteTable>;
}

/** No route could be had: the service is down, slow, or found none. Never replaced by a straight line. */
export class RouteUnavailable extends Error {}

const USER_AGENT = "RindeBot/0.1 (+https://rinde.cool.chuventures.com; grocery price comparison)";
const PROFILES: Record<RouteProfile, string> = { foot: "routed-foot", car: "routed-car" };
const WEEK_MS = 7 * 24 * 3_600_000;

interface OsrmOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Requests in flight at once, across every call (the public server's fair use) */
  maxConcurrent?: number;
  cacheTtlMs?: number;
  /** Retries when the server says it's busy (429/503); the public server limits bursts */
  retries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const BUSY = new Set([429, 503]);

export function createOsrmProvider(opts: OsrmOptions = {}): RouteProvider {
  const baseUrl = opts.baseUrl ?? "https://routing.openstreetmap.de";
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const ttl = opts.cacheTtlMs ?? WEEK_MS;
  const now = opts.now ?? Date.now;
  const limit = gate(opts.maxConcurrent ?? 2);
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  async function get(url: string): Promise<Record<string, unknown>> {
    // A busy answer waits inside the gate (Retry-After, else 0.4 s, 0.8 s, 1.6 s), which also
    // spaces out our own next requests.
    return limit(async () => {
      let res: Response;
      for (let attempt = 0; ; attempt++) {
        try {
          res = await doFetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
        } catch (error) {
          throw new RouteUnavailable(`routing unreachable: ${String(error)}`);
        }
        if (!BUSY.has(res.status) || attempt >= retries) break;
        const after = Number(res.headers.get("retry-after"));
        await sleep(after > 0 ? Math.min(after, 5) * 1000 : 400 * 2 ** attempt);
      }
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || body?.["code"] !== "Ok") throw new RouteUnavailable(`routing ${res.status} ${String(body?.["code"] ?? "")}`);
      return body;
    });
  }

  /** Same request within a week → same answer, without asking the server again. A failure isn't kept. */
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value as Promise<T>;
    const value = load();
    cache.set(key, { at: now(), value });
    value.catch(() => cache.delete(key));
    return value;
  }

  return {
    route(points, profile) {
      const coords = points.map(lonLat).join(";");
      return cached(`route:${profile}:${coords}`, async () => {
        const body = await get(`${baseUrl}/${PROFILES[profile]}/route/v1/driving/${coords}?overview=full&geometries=polyline6&steps=true`);
        return parseRoute(body);
      });
    },
    table(sources, destinations, profile) {
      const all = [...sources, ...destinations];
      const coords = all.map(lonLat).join(";");
      const src = sources.map((_, i) => i).join(";");
      const dst = destinations.map((_, i) => sources.length + i).join(";");
      return cached(`table:${profile}:${coords}:${src}:${dst}`, async () => {
        const body = await get(`${baseUrl}/${PROFILES[profile]}/table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration,distance`);
        return { durationsS: body["durations"] as (number | null)[][], distancesM: body["distances"] as (number | null)[][] };
      });
    },
  };
}

/** OSRM wants lon,lat; rounding to ~1 m keeps the cache from splitting on GPS noise. */
function lonLat([lat, lon]: LatLon) {
  return `${lon.toFixed(5)},${lat.toFixed(5)}`;
}

interface OsrmStep {
  name?: string;
  distance: number;
  duration: number;
  maneuver: { type: string; modifier?: string; exit?: number };
}

export function parseRoute(body: Record<string, unknown>): Route {
  const route = (body["routes"] as Array<{ distance: number; duration: number; geometry: string; legs: Array<{ distance: number; duration: number; steps: OsrmStep[] }> }> | undefined)?.[0];
  if (!route) throw new RouteUnavailable("routing found no route");
  return {
    distanceM: route.distance,
    durationS: route.duration,
    coordinates: decodePolyline(route.geometry, 6),
    legs: route.legs.map((leg) => ({
      distanceM: leg.distance,
      durationS: leg.duration,
      steps: leg.steps.map((s) => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier ?? null,
        name: s.name ?? "",
        exit: s.maneuver.exit ?? null,
        distanceM: s.distance,
        durationS: s.duration,
      })),
    })),
  };
}

/** Google's encoded polyline format, at OSRM's precision (polyline6 → 6). Returns [lat, lon]. */
export function decodePolyline(encoded: string, precision = 6): LatLon[] {
  const factor = 10 ** precision;
  const out: LatLon[] = [];
  let index = 0, lat = 0, lon = 0;
  const next = () => {
    let result = 0, shift = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lon += next();
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

/** Straight-line meters. Only for shortlisting which branches to route; never shown or priced. */
export function haversineM([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function gate(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
