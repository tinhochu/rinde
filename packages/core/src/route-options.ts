import { STORE_NAMES, optimize } from "./optimizer";
import type { Plan, PlanItem, RetailerSlug } from "./optimizer";
import {
  extraTrip, formatMinutes, routeProfile, shorterOrder, stopCost, tripDurationS, withinLimit, MINUTE_LIMITS,
  type RouteLength, type StepInput, type TravelSettings,
} from "./route-cost";

/**
 * The options of a route plan around the store the person is going to (the anchor): everything at the
 * anchor, or the anchor plus one other chain's branch. Goods come from the optimizer on stored prices,
 * distance and time from street routes; nothing here is a straight-line figure or a model's number.
 */

export type LatLon = [number, number];

export interface Branch {
  id: string;
  chain: RetailerSlug;
  name: string;
  address: string | null;
  area: string | null;
  lat: number;
  lon: number;
}

/** Structurally `@rinde/routing`'s types: core stays free of the network client. */
export interface RouteLegLike extends RouteLength {
  steps: StepInput[];
}
export interface RouteLike extends RouteLength {
  legs: RouteLegLike[];
  coordinates: LatLon[];
}
export interface RouteProviderLike {
  route(points: LatLon[], profile: "foot" | "car"): Promise<RouteLike>;
  table(sources: LatLon[], destinations: LatLon[], profile: "foot" | "car"): Promise<{ durationsS: (number | null)[][] }>;
}

/** Where the trip goes: a branch, or a point when the person's branch isn't listed. */
export interface Anchor {
  chain: RetailerSlug;
  point: LatLon;
  branch: Branch | null;
}

export interface RouteStop {
  chain: RetailerSlug;
  /** null when the anchor is the person's location or a typed address */
  branch: Branch | null;
  point: LatLon;
}

export interface RouteOption {
  /** "d1" or "d1+carulla" */
  key: string;
  /** "Solo en tu D1", "D1 + Carulla" */
  label: string;
  /** Stops in visiting order */
  stops: RouteStop[];
  plan: Plan;
  goodsTotal: number;
  /** Against everything at the anchor, over the items the anchor carries */
  saving: number;
  /** What the extra stop adds to the whole trip, by route, in this mode (bus includes its wait) */
  extra: RouteLength;
  travelCost: number;
  /** saving − travel cost */
  net: number;
  /** Items only the other chain carries */
  extraItems: string[];
  /** The route drawn and listed: start (when known) through every stop; null with no start and no second stop */
  route: RouteLike | null;
  /** The same stops in the other order, when there is a start; for putting cold items last */
  otherOrder: { stops: RouteStop[]; route: RouteLike } | null;
}

export interface LeftOut {
  chain: RetailerSlug;
  reason: string;
}

export interface RouteOptionsResult {
  options: RouteOption[];
  leftOut: LeftOut[];
  /** Set when the route from the person's location to the anchor failed: options then go anchor-and-back */
  startDropped: boolean;
}

export interface RouteOptionsInput {
  items: PlanItem[];
  anchor: Anchor;
  /** The person's location, rounded; null when they didn't share it */
  start: LatLon | null;
  /** Known branches of the other chains (any distance; the closest are shortlisted here) */
  branches: Branch[];
  retailers: RetailerSlug[];
  travel: TravelSettings;
  budget: number;
  provider: RouteProviderLike;
  now?: number;
}

/** Branches routed per chain: the closest by straight line, only to choose which to ask the router about. */
const SHORTLIST = 5;

export async function routeOptions(input: RouteOptionsInput): Promise<RouteOptionsResult> {
  const { items, anchor, travel, provider } = input;
  const profile = routeProfile(travel.mode);
  const planOpts = { budget: input.budget, tripCost: 0, now: input.now };
  const anchorStop: RouteStop = { chain: anchor.chain, branch: anchor.branch, point: anchor.point };
  const leftOut: LeftOut[] = [];

  let start = input.start;
  let base: RouteLike | null = null;
  if (start) {
    try {
      base = await provider.route([start, anchor.point], profile);
    } catch {
      start = null; // Without a route from home, plan from the anchor and back rather than guess.
    }
  }
  const startDropped = Boolean(input.start) && !start;

  const anchorPlan = optimize(items, { ...planOpts, retailers: [anchor.chain] });
  const anchorOption: RouteOption = {
    key: anchor.chain, label: `Solo en tu ${STORE_NAMES[anchor.chain]}`, stops: [anchorStop], plan: anchorPlan,
    goodsTotal: anchorPlan.total, saving: 0, extra: { distanceM: 0, durationS: 0 }, travelCost: 0, net: 0,
    extraItems: [], route: base, otherOrder: null,
  };
  const covered = new Map(anchorPlan.stores.flatMap((s) => s.lines).map((l) => [l.itemId, l.lineTotal]));

  const others = input.retailers.filter((r) => r !== anchor.chain);
  const nearest = others.flatMap((chain) =>
    input.branches
      .filter((b) => b.chain === chain)
      .map((b) => ({ b, d: straightM(anchor.point, [b.lat, b.lon]) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, SHORTLIST)
      .map((x) => x.b),
  );

  // One table call ranks every shortlisted branch by route time from the anchor.
  let durations: (number | null)[] = [];
  if (nearest.length) {
    try {
      durations = (await provider.table([anchor.point], nearest.map((b) => [b.lat, b.lon]), profile)).durationsS[0] ?? [];
    } catch {
      durations = [];
    }
  }

  const options: RouteOption[] = [anchorOption];
  for (const chain of others) {
    const name = STORE_NAMES[chain];
    const ranked = nearest
      .map((b, i) => ({ b, s: durations[i] }))
      .filter((x): x is { b: Branch; s: number } => x.b.chain === chain && typeof x.s === "number")
      .sort((x, y) => x.s - y.s);
    if (!ranked.length) {
      leftOut.push({ chain, reason: nearest.some((b) => b.chain === chain) ? `No pudimos calcular la ruta a ${name}` : `No conocemos un ${name} cerca` });
      continue;
    }
    const branch = ranked[0]!.b;
    const stop: RouteStop = { chain, branch, point: [branch.lat, branch.lon] };

    const plan = optimize(items, { ...planOpts, retailers: [anchor.chain, chain] });
    if (!plan.stores.some((s) => s.retailer === chain)) {
      leftOut.push({ chain, reason: `En ${name} nada de tu lista sale más barato` });
      continue;
    }
    const lines = plan.stores.flatMap((s) => s.lines);
    const saving = lines.filter((l) => covered.has(l.itemId)).reduce((sum, l) => sum + covered.get(l.itemId)! - l.lineTotal, 0);
    const extraItems = lines.filter((l) => !covered.has(l.itemId)).map((l) => l.label);

    let orders: { stops: RouteStop[]; route: RouteLike }[];
    try {
      orders = start
        ? await Promise.all([
            [anchorStop, stop],
            [stop, anchorStop],
          ].map(async (stops) => ({ stops, route: await provider.route([start!, ...stops.map((s) => s.point)], profile) })))
        : [{ stops: [anchorStop, stop], route: await provider.route([anchor.point, stop.point, anchor.point], profile) }];
    } catch {
      leftOut.push({ chain, reason: `No pudimos calcular la ruta a ${name}` });
      continue;
    }
    const best = shorterOrder(orders);
    const other = orders.find((o) => o !== best) ?? null;
    const baseLength = base ? { distanceM: base.distanceM, durationS: tripDurationS(travel.mode, base.durationS, 1) } : null;
    const extra = extraTrip(baseLength, { distanceM: best.route.distanceM, durationS: tripDurationS(travel.mode, best.route.durationS, 2) });
    if (!withinLimit(travel.mode, extra.durationS)) {
      leftOut.push({ chain, reason: `${name} suma ${formatMinutes(extra.durationS)}; el límite ${LIMIT_LABEL[travel.mode]} es ${MINUTE_LIMITS[travel.mode]} min` });
      continue;
    }
    const travelCost = stopCost(travel, extra.distanceM);
    options.push({
      key: `${anchor.chain}+${chain}`, label: `${STORE_NAMES[anchor.chain]} + ${name}`, stops: best.stops, plan,
      goodsTotal: plan.total, saving, extra, travelCost, net: saving - travelCost, extraItems,
      route: best.route, otherOrder: other,
    });
  }
  return { options, leftOut, startDropped };
}

const LIMIT_LABEL: Record<TravelSettings["mode"], string> = { walk: "a pie", bus: "en bus", moto: "en moto", car: "en carro" };

function straightM([lat1, lon1]: LatLon, [lat2, lon2]: LatLon) {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
