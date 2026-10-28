// Hand-off to live navigation: Rinde plans and draws the route, Google Maps or Waze guide it.
// Pure, so tests/navigate.test.cjs can load it in Node.

export type NavMode = "walk" | "bus" | "moto" | "car";
export type NavPoint = { lat: number; lon: number };

const GOOGLE_MODE: Record<NavMode, string> = { walk: "walking", bus: "transit", moto: "two-wheeler", car: "driving" };

const coord = (p: NavPoint) => `${p.lat},${p.lon}`;

/**
 * Google Maps directions through every stop. Without an origin Google starts from the phone's
 * location, which is what the person wants when they didn't share it with Rinde.
 */
export function googleMapsUrl(stops: NavPoint[], mode: NavMode, origin?: NavPoint | null): string {
  if (!stops.length) throw new Error("A route needs at least one stop");
  const params = new URLSearchParams({ api: "1" });
  if (origin) params.set("origin", coord(origin));
  params.set("destination", coord(stops[stops.length - 1]!));
  if (stops.length > 1) params.set("waypoints", stops.slice(0, -1).map(coord).join("|"));
  params.set("travelmode", GOOGLE_MODE[mode]);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Waze takes one destination: the next stop. */
export function wazeUrl(stop: NavPoint): string {
  return `https://waze.com/ul?ll=${encodeURIComponent(coord(stop))}&navigate=yes`;
}
