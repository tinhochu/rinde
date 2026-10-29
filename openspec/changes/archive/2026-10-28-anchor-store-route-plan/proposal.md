# Proposal

## Why

People don't plan a shopping trip from zero. They already know which supermarket they're going to. The question that saves money is: "is it worth also stopping at another store near there, and what do I buy where?"

Today the trip planner can't answer that:
- It treats every extra stop as the same flat cost (`tripCost`, `packages/core/src/optimizer/plan.ts`).
- It knows no store locations. Branches and routing were left out of `multi-store-trip-planner`.

So it can recommend a second chain that is across the city, or skip one that is next door.

This change builds on `cross-store-product-match`, which gives the planner the same product's price at every store.

## What Changes

- **"¿A qué súper vas?"** The plan starts from the store the person is going to (the anchor). They pick the chain and branch from a list, or tap "Usar mi ubicación" to pick the nearest branch. Location permission is optional.
- **Store branches.** Rinde gets a list of D1, Jumbo, Éxito and Carulla branches with coordinates and addresses, imported from OpenStreetMap. On 2026-10-28 the Bogotá area had 154 D1, 37 Carulla, 36 Éxito and 12 Jumbo branches mapped. Attribution is shown as the licence requires. When the person's branch isn't listed, they can use their location or type an address instead.
- **How they travel.** The person picks walking, bus/TransMilenio, motorcycle or car. Each has editable defaults: bus fare, cost per km, parking. They can also add context such as "tengo prisa", "voy cargado" or "no tengo carro" in a free-text note.
- **Real routes, not straight lines.** Distances and times come from a street route planned on OpenStreetMap roads by OSRM, a free routing engine with walking, car and bike profiles and no key. Moto uses the car profile.
  - Bus and TransMilenio aren't covered by free routing, so a bus trip uses the car route's distance plus the fare and an average wait, labeled as an estimate.
  - On a test trip in Chapinero (2026-10-28), the straight line was 880 m and the walking route 1,194 m, 16 minutes.
- **Real cost of the extra stop.** For each other chain's branch in reach of the anchor (the best one by route time, not by straight line), the optimizer computes:
  - the savings of buying some items there;
  - the extra route distance and minutes for the whole trip;
  - the travel cost for the chosen mode.

  This replaces the flat trip cost when an anchor is set. The optimizer stays deterministic, and every number comes from stored prices, the route, and these formulas.
- **The route on a map, then navigation.** The plan shows the full route on a map in the app: home or the person's location, then each stop. It also lists the total distance and minutes and the turn-by-turn steps in Spanish. "Navegar" hands off to Google Maps (all stops) or Waze (next stop) for live guidance.
- **Muse decides and explains.** Muse receives the computed options: "solo en tu D1", "D1 + Carulla, 600 m caminando", and so on, with their net savings, minutes and cost, plus the person's mode and note. It reasons about whether moving is worth it for this person (heavy or cold items, time, walking with bags) and recommends one option, in plain Spanish. It may ask one follow-up question when something decisive is missing ("¿vas con carro?"). Muse never computes or changes a number. It chooses among the options and explains with the numbers it was given.
- **One trip, in order.**
  - The plan is a single route: anchor first or second, depending on the detour.
  - Each stop has its own list.
  - Cold and heavy items go to the last stop, ordered by Muse within each stop.
  - The stop order is chosen by route time.
  - When staying at the anchor is the best choice, the plan says so and states what was given up.

## Capabilities

### New Capabilities
- `anchor-store-route`: planning a shopping trip around the store the person is going to. Covers:
  - the branch list and anchor selection;
  - the travel mode and cost settings;
  - street routing, and per-option distance, time and cost;
  - Muse's recommendation and explanation;
  - the ordered route output with its map, steps and navigation hand-off.

### Modified Capabilities
- None in `openspec/specs/`. This change extends the optimizer that `multi-store-trip-planner` introduced: an anchor store and a per-store travel cost replace the flat `tripCost` when an anchor is set. Plans without an anchor keep today's behavior.

## Impact

- **Data:** a new `StoreBranch` table (chain, name, address, latitude, longitude, OSM id, last refreshed) with a migration, and an import script from the Overpass API, run once and then monthly.
- **Routing service:** the FOSSGIS public OSRM servers (`routing.openstreetmap.de`, profiles `routed-foot`, `routed-car`, `routed-bike`), used within their fair-use policy: a User-Agent, cached routes, one request per plan option. The client sits behind an interface, so a self-hosted OSRM or a paid provider can replace it.
- **`packages/core`:**
  - travel-cost functions from route distance and time, and Spanish step text from route maneuvers;
  - the optimizer accepts `anchor` and per-store `stopCost`;
  - an options builder: the anchor alone, and the anchor plus each nearby chain.
- **`apps/web`:**
  - `GET /api/branches` (near a point, or by chain and name);
  - a route-plan endpoint that runs the optimizer options, then the Muse recommendation, with a deterministic fallback (largest net saving above a minimum).
- **`apps/mobile`:**
  - the "¿A qué súper vas?" step: chain, branch, location, travel mode and note;
  - the route plan screen: a map with the route line and stops, per-stop lists, the step list, Muse's explanation, and "Navegar" (Google Maps or Waze);
  - `expo-location`, plus a map component: MapLibre GL with OpenStreetMap tiles on web (the PWA), and `react-native-maps` on native, installed with `npx expo install`.
- **Limits:**
  - Online prices are chain-wide, not per branch. The plan says so.
  - Bus and TransMilenio times are estimates from the car route; there are no schedules.
  - Live turn-by-turn guidance and rerouting happen in Google Maps or Waze, not inside Rinde.
