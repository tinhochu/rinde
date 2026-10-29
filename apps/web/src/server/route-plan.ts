import "server-only";
import { z } from "zod";
import {
  DEFAULT_TRAVEL, STORE_NAMES, formatDistance, formatMinutes, isCold, isHeavy, orderLines, routeOptions, stepText,
  type Branch, type PlanItem, type PlanLine, type RouteLike, type RouteOption, type RouteStop, type TravelSettings,
} from "@rinde/core";
import type { RetailerSlug } from "@rinde/db";
import { haversineM, type LatLon, type RouteProvider } from "@rinde/routing";
import { allBranches, roundPoint, routing } from "./branches";
import { candidatesFor } from "./candidates";
import { judgeKinds } from "./kind-judge";
import { liveDeps } from "./live";
import { loadList, PlanError } from "./plan-service";
import { adviseRoute, type RouteAdvice } from "./route-advice";
import { planAndVerify, type VerifyDeps } from "./verify";

/**
 * A plan around the store the person is going to. Options come from stored prices and street routes,
 * Muse picks one for this person, then the chosen stores' prices are checked live. The person's
 * location, a typed address and the note are used for this request only and never stored.
 */

const chain = z.enum(["d1", "jumbo", "exito", "carulla"]);
const point = { lat: z.number().min(-5).max(14), lon: z.number().min(-82).max(-66) };

export const routePlanSchema = z.object({
  listId: z.string().min(1),
  anchor: z.union([
    z.object({ branchId: z.string().min(1) }),
    z.object({ chain, ...point }),
    z.object({ chain, address: z.string().trim().min(4).max(160) }),
  ]),
  start: z.object(point).nullish(),
  travel: z.object({
    mode: z.enum(["walk", "bus", "moto", "car"]),
    busFare: z.number().int().min(0).max(20_000).default(DEFAULT_TRAVEL.busFare),
    motoPerKm: z.number().int().min(0).max(5_000).default(DEFAULT_TRAVEL.motoPerKm),
    carPerKm: z.number().int().min(0).max(10_000).default(DEFAULT_TRAVEL.carPerKm),
    parking: z.number().int().min(0).max(50_000).default(DEFAULT_TRAVEL.parking),
  }),
  note: z.string().max(200).default(""),
  /** The person's answer to Muse's follow-up question; Muse then doesn't ask again */
  answer: z.string().max(120).optional(),
});
export type RoutePlanRequest = z.infer<typeof routePlanSchema>;

export interface ClientStop {
  chain: RetailerSlug;
  name: string;
  address: string | null;
  area: string | null;
  lat: number;
  lon: number;
  branchId: string | null;
}
export interface ClientLine {
  itemId: string;
  label: string;
  product: string;
  packs: number;
  lineTotal: number;
  cold: boolean;
  heavy: boolean;
}
export interface ClientLeg {
  /** Where the leg ends, e.g. "Carulla Calle 63" */
  to: string;
  distance: string;
  minutes: string;
  steps: string[];
}
export interface ClientRoute {
  distance: string;
  minutes: string;
  coordinates: LatLon[];
  legs: ClientLeg[];
  /** The start of the line: the person, or the anchor on an anchor-and-back trip */
  from: LatLon;
}
export interface ClientOption {
  key: string;
  label: string;
  stops: ClientStop[];
  stopLines: ClientLine[][];
  goodsTotal: number;
  saving: number;
  extraDistance: string;
  extraMinutes: string;
  travelCost: number;
  /** On a bus trip, the stores are close enough to walk between */
  walkBetween: boolean;
  net: number;
  extraItems: string[];
  route: ClientRoute | null;
}

export type RoutePlanEvent =
  | { type: "options"; options: ClientOption[]; leftOut: { chain: RetailerSlug; reason: string }[]; startDropped: boolean; busEstimate: boolean }
  | { type: "question"; question: string; choice: number; explanation: string }
  | { type: "advice"; choice: number; explanation: string; source: "muse" | "rule"; foregone: { label: string; net: number } | null; stopLines: ClientLine[][] }
  | { type: "verified"; choice: number; goodsTotal: number; saving: number; net: number; stopLines: ClientLine[][]; checked: number }
  | { type: "error"; error: string };

export interface RoutePlanDeps {
  provider: RouteProvider;
  branches: () => Promise<Branch[]>;
  geocode: (address: string) => Promise<LatLon | null>;
  verify: VerifyDeps;
  advise: typeof adviseRoute;
  items?: (listId: string) => Promise<{ items: PlanItem[]; budget: number; retailers: RetailerSlug[] }>;
}

export const routePlanDeps = (): RoutePlanDeps => ({
  provider: routing(), branches: allBranches, geocode, verify: liveDeps, advise: adviseRoute,
});

/** Branches of the other chains within this many meters of the anchor are considered at all. */
const AREA_M = 15_000;

export async function runRoutePlan(req: RoutePlanRequest, emit: (e: RoutePlanEvent) => void, deps: RoutePlanDeps = routePlanDeps()) {
  const branches = await deps.branches();
  const anchor = await resolveAnchor(req.anchor, branches, deps);
  const { items, budget, retailers } = await (deps.items ?? listItems)(req.listId);
  const travel: TravelSettings = req.travel;
  const start = req.start ? roundPoint([req.start.lat, req.start.lon]) : null;
  const nearby = branches.filter((b) => b.chain !== anchor.chain && haversineM(anchor.point, [b.lat, b.lon]) <= AREA_M);

  const result = await routeOptions({
    items, anchor, start, branches: nearby, retailers: retailers.includes(anchor.chain) ? retailers : [anchor.chain, ...retailers],
    travel, budget, provider: deps.provider,
  });
  const usedStart = result.startDropped ? null : start;
  const options = result.options.map((o) => toClient(o, anchor.point, usedStart));
  emit({ type: "options", options, leftOut: result.leftOut, startDropped: result.startDropped, busEstimate: travel.mode === "bus" });

  const note = [req.note, req.answer ? `Respuesta: ${req.answer}` : ""].filter(Boolean).join(" · ");
  const advice: RouteAdvice = await deps.advise(result.options, travel, note, { allowQuestion: !req.answer });
  const chosen = result.options[advice.choice]!;
  const ordered = chosen.stopLines.map((lines, i) => orderLines(lines, advice.itemOrder.get(i)));
  if (advice.question) {
    emit({ type: "question", question: advice.question, choice: advice.choice, explanation: advice.explanation });
  } else {
    emit({
      type: "advice", choice: advice.choice, explanation: advice.explanation, source: advice.source, foregone: advice.foregone,
      stopLines: ordered.map((ls) => ls.map(clientLine)),
    });
  }

  // The chosen stores' prices, checked live now; the stops and their order stay as advised.
  const chains = [...new Set(chosen.stops.map((s) => s.chain))];
  const verified = await planAndVerify(items, { budget, retailers: chains, tripCost: 0 }, deps.verify);
  const lines = verified.plan.stores.flatMap((s) => s.lines);
  const labelOrder = new Map(ordered.flat().map((l, i) => [l.itemId, i]));
  const stopLines = chosen.stops.map((s) =>
    lines.filter((l) => l.candidate.retailer === s.chain).sort((a, b) => (labelOrder.get(a.itemId) ?? 99) - (labelOrder.get(b.itemId) ?? 99)),
  );
  const anchorTotals = new Map(result.options[0]!.plan.stores.flatMap((s) => s.lines).map((l) => [l.itemId, l.lineTotal]));
  const saving = advice.choice === 0 ? 0 : lines.filter((l) => anchorTotals.has(l.itemId)).reduce((sum, l) => sum + anchorTotals.get(l.itemId)! - l.lineTotal, 0);
  emit({
    type: "verified", choice: advice.choice, goodsTotal: verified.plan.total, saving, net: saving - chosen.travelCost,
    stopLines: stopLines.map((ls) => ls.map(clientLine)), checked: lines.filter((l) => l.candidate.priceStatus === "live").length,
  });
}

async function listItems(listId: string) {
  const { requests, options } = await loadList(listId);
  const retailers = options.retailers as RetailerSlug[];
  const found = await Promise.all(requests.map((r) => candidatesFor(r, retailers)));
  return { items: await judgeKinds(found), budget: options.budget, retailers };
}

async function resolveAnchor(anchor: RoutePlanRequest["anchor"], branches: Branch[], deps: RoutePlanDeps) {
  if ("branchId" in anchor) {
    const branch = branches.find((b) => b.id === anchor.branchId);
    if (!branch) throw new PlanError("No encontramos esa tienda. Elígela de nuevo.", 404);
    return { chain: branch.chain, point: [branch.lat, branch.lon] as LatLon, branch };
  }
  if ("address" in anchor) {
    const found = await deps.geocode(anchor.address);
    if (!found) throw new PlanError("No encontramos esa dirección. Escríbela con ciudad, por ejemplo \"Calle 63 # 9-20, Bogotá\".", 400);
    return { chain: anchor.chain, point: roundPoint(found), branch: null };
  }
  return { chain: anchor.chain, point: roundPoint([anchor.lat, anchor.lon]), branch: null };
}

function clientLine(l: PlanLine): ClientLine {
  return { itemId: l.itemId, label: l.label, product: l.candidate.name, packs: l.packs, lineTotal: l.lineTotal, cold: isCold(l), heavy: isHeavy(l) };
}

function stopName(s: RouteStop) {
  return s.branch?.name ?? `Tu ${STORE_NAMES[s.chain]}`;
}

export function toClient(o: RouteOption, anchorPoint: LatLon, start: LatLon | null): ClientOption {
  const stops = o.stops.map((s): ClientStop => ({
    chain: s.chain, name: stopName(s), address: s.branch?.address ?? null, area: s.branch?.area ?? null,
    lat: s.point[0], lon: s.point[1], branchId: s.branch?.id ?? null,
  }));
  // The points the route runs through: from the person through every stop, or anchor → other → anchor.
  const anchorStop = o.stops.find((s) => s.point === anchorPoint || (s.point[0] === anchorPoint[0] && s.point[1] === anchorPoint[1])) ?? o.stops[0]!;
  const otherStop = o.stops.find((s) => s !== anchorStop);
  const through: RouteStop[] = start ? o.stops : otherStop ? [anchorStop, otherStop, anchorStop] : [];
  return {
    key: o.key, label: o.label, stops, stopLines: o.stopLines.map((ls) => ls.map(clientLine)),
    goodsTotal: o.goodsTotal, saving: o.saving, extraDistance: formatDistance(o.extra.distanceM), extraMinutes: formatMinutes(o.extra.durationS),
    travelCost: o.travelCost, walkBetween: o.walkBetween, net: o.net, extraItems: o.extraItems,
    route: o.route ? clientRoute(o.route, start ? through : through.slice(1), start ?? anchorPoint) : null,
  };
}

function clientRoute(route: RouteLike, legEnds: RouteStop[], from: LatLon): ClientRoute {
  return {
    distance: formatDistance(route.distanceM), minutes: formatMinutes(route.durationS), coordinates: route.coordinates, from,
    legs: route.legs.map((leg, i) => {
      const end = legEnds[i];
      const name = end ? stopName(end) : "tu destino";
      return {
        to: name, distance: formatDistance(leg.distanceM), minutes: formatMinutes(leg.durationS),
        steps: leg.steps.map((s) => stepText(s, name)),
      };
    }),
  };
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RindeBot/0.1 (+https://rinde.cool.chuventures.com; grocery price comparison)";
const geocoded = new Map<string, Promise<LatLon | null>>();
let lastGeocode = 0;

/** A typed address in Colombia → a point, via Nominatim: at most one request a second, answers kept. */
export function geocode(address: string): Promise<LatLon | null> {
  const key = address.toLowerCase().replace(/\s+/g, " ").trim();
  let hit = geocoded.get(key);
  if (!hit) {
    hit = (async () => {
      const wait = lastGeocode + 1100 - Date.now();
      lastGeocode = Math.max(Date.now(), lastGeocode + 1100);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=co&accept-language=es&q=${encodeURIComponent(address)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`nominatim ${res.status}`);
      const first = ((await res.json()) as { lat: string; lon: string }[])[0];
      return first ? ([Number(first.lat), Number(first.lon)] as LatLon) : null;
    })();
    geocoded.set(key, hit);
    hit.catch(() => geocoded.delete(key));
  }
  return hit.catch(() => null);
}
