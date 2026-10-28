import "server-only";
import { z } from "zod";
import { routeProfile, type Branch, type TravelMode } from "@rinde/core";
import { db, type RetailerSlug } from "@rinde/db";
import { createOsrmProvider, haversineM, type LatLon, type RouteProvider } from "@rinde/routing";

/**
 * Supermarket branches (OpenStreetMap) for the "¿A qué súper vas?" step: by name or neighborhood
 * without location, or by route time from where the person is.
 */

let provider: RouteProvider | null = null;
/** One provider per server process, so its week-long route cache and request gate are shared. */
export function routing(): RouteProvider {
  return (provider ??= createOsrmProvider());
}

const CACHE_MS = 10 * 60_000;
let all: { at: number; branches: Promise<Branch[]> } | null = null;

/** Every branch, kept in memory a few minutes (under a thousand rows). */
export function allBranches(): Promise<Branch[]> {
  if (!all || Date.now() - all.at > CACHE_MS) {
    const branches = db().storeBranch.findMany({ select: { id: true, chain: true, name: true, address: true, area: true, lat: true, lon: true } });
    const entry = { at: Date.now(), branches };
    all = entry;
    // An empty table means the import hasn't run yet: ask again next time instead of for 10 minutes.
    branches.then((rows) => { if (!rows.length && all === entry) all = null; }, () => { if (all === entry) all = null; });
  }
  return all.branches;
}

/** ~100 m: enough to route from, too coarse to place a home. Never stored. */
export const roundPoint = ([lat, lon]: LatLon): LatLon => [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const CHAIN_WORDS: Record<string, RetailerSlug> = { d1: "d1", jumbo: "jumbo", exito: "exito", carulla: "carulla" };

export const branchQuerySchema = z.union([
  z.object({
    near: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).transform((s) => roundPoint(s.split(",").map(Number) as LatLon)),
    chain: z.enum(["d1", "jumbo", "exito", "carulla"]).optional(),
    mode: z.enum(["walk", "bus", "moto", "car"]).default("walk"),
  }),
  z.object({ q: z.string().trim().min(2).max(80), chain: z.enum(["d1", "jumbo", "exito", "carulla"]).optional() }),
]);
export type BranchQuery = z.infer<typeof branchQuerySchema>;

export type BranchResult = Branch & { distanceM?: number; durationS?: number };

const LIMIT = 20;

export async function findBranches(query: BranchQuery, opts: { provider?: RouteProvider; branches?: Branch[] } = {}): Promise<{ branches: BranchResult[]; routed: boolean }> {
  const branches = opts.branches ?? (await allBranches());
  if ("q" in query) {
    // "D1 Chapinero": a chain word picks the chain, every other word must be in the name, area or address.
    const words = norm(query.q).split(/\s+/).filter(Boolean);
    const chain = query.chain ?? words.map((w) => CHAIN_WORDS[w]).find(Boolean);
    const rest = words.filter((w) => !CHAIN_WORDS[w]);
    const found = branches.filter((b) => {
      if (chain && b.chain !== chain) return false;
      const text = norm(`${b.name} ${b.area ?? ""} ${b.address ?? ""}`);
      return rest.every((w) => text.includes(w));
    });
    return { branches: found.sort((a, b) => a.name.localeCompare(b.name, "es")).slice(0, LIMIT), routed: false };
  }

  const near = query.near;
  // Straight line only shortlists; what's shown and sorted is the route.
  const shortlist = branches
    .filter((b) => !query.chain || b.chain === query.chain)
    .map((b) => ({ b, d: haversineM(near, [b.lat, b.lon]) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, LIMIT)
    .map((x) => x.b);
  if (!shortlist.length) return { branches: [], routed: true };
  try {
    const table = await (opts.provider ?? routing()).table([near], shortlist.map((b) => [b.lat, b.lon]), routeProfile(query.mode as TravelMode));
    const results = shortlist
      .flatMap((b, i): (Branch & { distanceM: number; durationS: number })[] => {
        const durationS = table.durationsS[0]?.[i];
        const distanceM = table.distancesM[0]?.[i];
        return typeof durationS === "number" && typeof distanceM === "number" ? [{ ...b, distanceM, durationS }] : [];
      })
      .sort((a, b) => a.durationS - b.durationS);
    return { branches: results, routed: true };
  } catch {
    // No routes: list them nearest-first without any distance rather than a straight-line one.
    return { branches: shortlist, routed: false };
  }
}
