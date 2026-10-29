/**
 * What an extra stop costs a person, from street routes (never straight lines): the extra minutes and
 * kilometers of the whole trip, and the money that travel costs in their mode. Deterministic; the
 * numbers a route plan shows come from here and from stored prices.
 */

export type TravelMode = "walk" | "bus" | "moto" | "car";

/** The person's costs, editable in the app and kept on the device. Pesos. */
export interface TravelSettings {
  mode: TravelMode;
  busFare: number;
  motoPerKm: number;
  carPerKm: number;
  parking: number;
}

export const DEFAULT_TRAVEL: Omit<TravelSettings, "mode"> = { busFare: 3200, motoPerKm: 250, carPerKm: 600, parking: 3000 };

/** An extra stop is offered only when it adds at most this many minutes, by route. */
export const MINUTE_LIMITS: Record<TravelMode, number> = { walk: 20, bus: 30, moto: 25, car: 25 };

/** Which street network to route on. Bus has no free routing; it uses the car route (see `tripDurationS`). */
export function routeProfile(mode: TravelMode): "foot" | "car" {
  return mode === "walk" ? "foot" : "car";
}

/** Bus estimate from the car route: slower, plus an average wait. Labeled "estimado, sin horarios". */
export const BUS_FACTOR = 1.6;
export const BUS_WAIT_S = 8 * 60;

/** On a bus trip, stores this close are walked between: no second fare, no second wait. */
export const BUS_WALK_HOP_M = 600;
/** An unhurried walk with bags, for hops walked on a bus trip. */
export const WALK_MPS = 1.2;

/** Travel time for a route in this mode. Bus waits once per ride. */
export function tripDurationS(mode: TravelMode, routeDurationS: number, rides = 1): number {
  return mode === "bus" ? routeDurationS * BUS_FACTOR + BUS_WAIT_S * rides : routeDurationS;
}

export interface RouteLength {
  distanceM: number;
  durationS: number;
}

/**
 * The extra trip a second stop adds: the route through both stores minus the route to the anchor
 * alone. Without the person's location the base is zero and the trip is anchor → B → anchor.
 */
export function extraTrip(base: RouteLength | null, withStop: RouteLength): RouteLength {
  return {
    distanceM: Math.max(0, withStop.distanceM - (base?.distanceM ?? 0)),
    durationS: Math.max(0, withStop.durationS - (base?.durationS ?? 0)),
  };
}

/** The visiting order whose route takes the least time (first wins a tie). */
export function shorterOrder<T extends { route: RouteLength }>(orders: T[]): T {
  return orders.reduce((best, o) => (o.route.durationS < best.route.durationS ? o : best));
}

/** Money the extra stop costs in this mode: walking is free, bus is one more fare, moto and car per km (car also parks). */
export function stopCost(settings: TravelSettings, extraDistanceM: number): number {
  const km = extraDistanceM / 1000;
  switch (settings.mode) {
    case "walk": return 0;
    case "bus": return settings.busFare;
    case "moto": return roundPesos(km * settings.motoPerKm);
    case "car": return roundPesos(km * settings.carPerKm) + settings.parking;
  }
}

export function withinLimit(mode: TravelMode, extraDurationS: number): boolean {
  return extraDurationS <= MINUTE_LIMITS[mode] * 60;
}

const roundPesos = (n: number) => Math.round(n / 100) * 100;

const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "600 m", "1,2 km": meters to the nearest 10 below a kilometer. */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${decimal.format(Math.round(m / 100) / 10)} km`;
}

/** "16 min", at least 1. */
export function formatMinutes(s: number): string {
  return `${Math.max(1, Math.round(s / 60))} min`;
}

/** An OSRM maneuver, as `@rinde/routing` gives it. */
export interface StepInput {
  type: string;
  modifier: string | null;
  name: string;
  exit: number | null;
  distanceM: number;
}

const DIRECTION: Record<string, string> = {
  right: "a la derecha", left: "a la izquierda",
  "slight right": "levemente a la derecha", "slight left": "levemente a la izquierda",
  "sharp right": "bruscamente a la derecha", "sharp left": "bruscamente a la izquierda",
};
const KEEP: Record<string, string> = {
  right: "a la derecha", "slight right": "a la derecha", "sharp right": "a la derecha",
  left: "a la izquierda", "slight left": "a la izquierda", "sharp left": "a la izquierda",
};
// Bogotá's street words are feminine: "la Calle 57", "la Carrera 7", "la Avenida Caracas".
const FEMININE = /^(calle|carrera|avenida|av\.?|diagonal|transversal|autopista|circular|vía|via|troncal|glorieta)\b/i;

function onto(name: string) {
  if (!name) return "";
  return FEMININE.test(name) ? `la ${name}` : name;
}

/**
 * One turn-by-turn step in Spanish: "Gira a la derecha en la Calle 57 · 200 m". `destination` names
 * where an arrival is ("Llegas a Carulla Calle 63").
 */
export function stepText(step: StepInput, destination?: string): string {
  const street = onto(step.name);
  const dir = step.modifier ? DIRECTION[step.modifier] : undefined;
  let text: string;
  switch (step.type) {
    case "depart":
      text = street ? `Sal por ${street}` : "Sal hacia la vía";
      break;
    case "arrive":
      return destination ? `Llegas a ${destination}` : "Llegas a tu destino";
    case "turn":
    case "end of road": {
      const prefix = step.type === "end of road" ? "Al final de la vía, gira" : "Gira";
      if (step.modifier === "uturn") text = "Da la vuelta en U";
      else if (step.modifier === "straight" || !dir) text = street ? `Sigue derecho por ${street}` : "Sigue derecho";
      else text = `${prefix} ${dir}${street ? ` en ${street}` : ""}`;
      break;
    }
    case "fork":
    case "on ramp":
    case "off ramp": {
      const keep = step.modifier ? KEEP[step.modifier] : undefined;
      const lead = step.type === "fork" ? "En la bifurcación, mantente" : "Toma la rampa";
      text = `${lead}${keep ? ` ${keep}` : ""}${street ? ` hacia ${street}` : ""}`;
      break;
    }
    case "merge":
      text = street ? `Incorpórate a ${street}` : "Incorpórate a la vía";
      break;
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      text = `En la glorieta, toma la ${step.exit ? `${step.exit}.ª ` : ""}salida${street ? ` hacia ${street}` : ""}`;
      break;
    case "exit roundabout":
    case "exit rotary":
      text = street ? `Sal de la glorieta hacia ${street}` : "Sal de la glorieta";
      break;
    default: // "continue", "new name", "notification"
      if (dir && step.type === "continue") text = `Sigue ${dir}${street ? ` por ${street}` : ""}`;
      else text = street ? `Sigue por ${street}` : "Sigue derecho";
  }
  return step.distanceM > 0 ? `${text} · ${formatDistance(step.distanceM)}` : text;
}
