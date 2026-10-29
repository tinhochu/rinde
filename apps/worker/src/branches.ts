// Supermarket branches from OpenStreetMap (© OpenStreetMap contributors, ODbL), for route plans.
// One Overpass query for all of Colombia, then a Nominatim reverse lookup per new branch for its
// neighborhood, at most one per second (Nominatim's usage policy). Run monthly and by hand:
// `node dist/branches.mjs`.
import type { RetailerSlug } from "@rinde/db";
import { db } from "@rinde/db";

const USER_AGENT = "RindeBot/0.1 (+https://rinde.cool.chuventures.com; grocery price comparison)";
// The main instance is often busy (502/504); a second public instance serves the same data.
const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

const BRANDS = ["D1", "Tiendas D1", "Jumbo", "Éxito", "Exito", "Carulla"];
const CHAIN_BY_BRAND: Record<string, RetailerSlug> = {
  d1: "d1", "tiendas d1": "d1", jumbo: "jumbo", "éxito": "exito", exito: "exito", carulla: "carulla",
};
const CHAIN_NAMES: Record<RetailerSlug, string> = { d1: "D1", jumbo: "Jumbo", exito: "Éxito", carulla: "Carulla" };

export const OVERPASS_QUERY = `[out:json][timeout:120];
area["ISO3166-1"="CO"][admin_level=2]->.co;
nwr["shop"~"supermarket|convenience|department_store"]["brand"~"^(${BRANDS.join("|")})$",i](area.co);
out center tags;`;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface ParsedBranch {
  chain: RetailerSlug;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  osmId: string;
}

/** Overpass elements → branches: brand to chain, a readable name ("Éxito Calle 80"), the mapped address. */
export function branchesFromOverpass(json: { elements: OverpassElement[] }): ParsedBranch[] {
  return json.elements.flatMap((e): ParsedBranch[] => {
    const tags = e.tags ?? {};
    const chain = CHAIN_BY_BRAND[(tags["brand"] ?? "").trim().toLowerCase()];
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!chain || lat === undefined || lon === undefined) return [];
    const chainName = CHAIN_NAMES[chain];
    const own = tags["branch"] ?? (tags["name"] && !sameName(tags["name"], chainName) ? stripChain(tags["name"], chainName) : null);
    return [{ chain, name: own ? `${chainName} ${own}` : chainName, address: address(tags), lat, lon, osmId: `${e.type}/${e.id}` }];
  });
}

function sameName(name: string, chainName: string) {
  const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/^tiendas\s+/, "").trim();
  return plain(name) === plain(chainName);
}

function stripChain(name: string, chainName: string) {
  const rest = name.replace(new RegExp(`^(tiendas\\s+)?${chainName}\\s*[-–]?\\s*`, "i"), "").trim();
  return rest || null;
}

function address(tags: Record<string, string>): string | null {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" # ");
  const parts = [street, tags["addr:city"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function fetchOverpass(): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length]!;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return (await res.json()) as { elements: OverpassElement[] };
      lastError = new Error(`overpass ${res.status} at ${new URL(url).host}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
  }
  throw lastError;
}

/** Neighborhood (else locality) and nearest street for a point, from one Nominatim reverse lookup. */
async function placeOf(lat: number, lon: number): Promise<Place> {
  const url = `${NOMINATIM_URL}?format=jsonv2&zoom=18&accept-language=es&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
  return { area: areaFrom(a), street: streetFrom(a) };
}

type Place = { area: string | null; street: string | null };

/**
 * Most D1s carry no address in OSM, so a list of them reads "D1, D1, D1". The street Nominatim
 * finds at the point tells them apart: "Calle 57 # 9-30" with a number, else "Cerca de Calle 57".
 */
export function streetFrom(a: Record<string, string>): string | null {
  const road = a["road"]?.trim();
  if (!road) return null;
  return a["house_number"] ? `${road} # ${a["house_number"].trim()}` : `Cerca de ${road}`;
}

/**
 * "Chapinero, Bogotá" from a Nominatim address. Bogotá's data names admin units oddly: the
 * neighbourhood can be "UPZs de Bogotá", the suburb "Localidad Chapinero", the city "Bogotá ciudad".
 */
export function areaFrom(a: Record<string, string>): string | null {
  const place = [a["neighbourhood"], a["quarter"], a["suburb"], a["city_district"], a["village"]]
    .map((v) => v?.replace(/^localidad\s+/i, "").trim())
    .find((v) => v && !/^upz/i.test(v));
  const city = (a["city"] ?? a["town"] ?? a["municipality"])?.replace(/\s+ciudad$/i, "").trim();
  const parts = [place, city].filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i);
  return parts.length ? parts.join(", ") : null;
}

export async function importBranches(opts: { fetchJson?: typeof fetchOverpass; lookupPlace?: typeof placeOf; pauseMs?: number } = {}) {
  const prisma = db();
  const branches = branchesFromOverpass(await (opts.fetchJson ?? fetchOverpass)());
  const refreshedAt = new Date();
  for (const b of branches) {
    // OSM without an address keeps the street found earlier; a mapped address replaces it.
    const { address, ...rest } = b;
    await prisma.storeBranch.upsert({ where: { osmId: b.osmId }, create: { ...b, refreshedAt }, update: { ...rest, ...(address ? { address } : {}), refreshedAt } });
  }
  // A branch gone from OSM is closed or merged; drop it, unless this answer looks partial.
  const previous = await prisma.storeBranch.count();
  let removed = 0;
  if (branches.length >= previous * 0.8) {
    removed = (await prisma.storeBranch.deleteMany({ where: { refreshedAt: { lt: refreshedAt } } })).count;
  }

  const lookup = opts.lookupPlace ?? placeOf;
  const pause = opts.pauseMs ?? 1100;
  const missing = await prisma.storeBranch.findMany({
    where: { OR: [{ area: null }, { address: null }] },
    select: { id: true, lat: true, lon: true, area: true, address: true },
  });
  let areas = 0;
  for (const b of missing) {
    try {
      const place = await lookup(b.lat, b.lon);
      const data = { ...(!b.area && place.area ? { area: place.area } : {}), ...(!b.address && place.street ? { address: place.street } : {}) };
      if (Object.keys(data).length) { await prisma.storeBranch.update({ where: { id: b.id }, data }); areas++; }
    } catch (error) {
      console.warn(`[branches] area lookup failed for ${b.id}: ${String(error)}`);
    }
    if (pause) await new Promise((r) => setTimeout(r, pause));
  }

  const counts = Object.fromEntries(
    (await prisma.storeBranch.groupBy({ by: ["chain"], _count: true })).map((g) => [g.chain, g._count]),
  );
  console.log(`[branches] ${branches.length} from OSM, ${removed} removed, ${areas} places filled; by chain ${JSON.stringify(counts)}`);
  return { imported: branches.length, removed, areas, counts };
}

// `node dist/branches.mjs` imports once and exits. Matched by file name, not import.meta.url: the worker
// bundle inlines this module into dist/index.mjs, where import.meta.url is index.mjs and would match it.
if (/[\\/]branches\.(ts|mjs)$/.test(process.argv[1] ?? "")) {
  await importBranches();
  process.exit(0);
}
