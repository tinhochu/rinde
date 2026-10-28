# Design

## Context

- **Optimizer** (`packages/core/src/optimizer/plan.ts`):
  - It tries every store subset (at most 15 for 4 chains) and picks the cheapest goods total plus `tripCost × (stores − 1)`.
  - `forceStores` already computes the plan for a fixed set of stores.
  - `plan-service.ts` runs the optimizer, live-verifies the chosen prices and streams events (NDJSON) to `app/(tabs)/plan.tsx`.
- **Locations:** Rinde has none. Receipts keep a `branch` string, and online prices are chain-wide (default region).
- **Muse** is reached through `museJson` (`apps/web/src/server/muse.ts`): a strict JSON schema, zod validation, and `MuseUnavailable` when there's no key or no answer. Every Muse use so far chooses among given options and never sees prices it could change.
- **Branch data:** OpenStreetMap (Overpass API) has the four chains tagged by `brand`. In the Bogotá box on 2026-10-28: D1 154, Carulla 37, Éxito 36, Jumbo 12. That is partial for D1, which has far more stores.
- **Dependency:** `cross-store-product-match` should land first, so options compare the same product across chains.

## Goals / Non-Goals

**Goals:**
- Answer "I'm going to this store; is a second stop worth it for me?" with real distances and the person's travel cost.
- Muse makes the human judgment and explains it, while every number stays deterministic.
- Plans without an anchor keep working exactly as today.

**Non-Goals:**
- Per-branch prices. Online prices are chain-wide; receipts already carry branch prices, but mixing them in is a later change.
- Live in-app turn-by-turn guidance (GPS following, rerouting, voice). Rinde plans and draws the route, and Google Maps or Waze guide.
- Transit routing with schedules. Free routing has no bus/TransMilenio data, so bus trips are estimated from the car route.
- Traffic-aware times. The OSRM profiles use typical speeds.
- More than one extra stop. Anchor plus one keeps the choice understandable and the walk realistic.
- Branch opening hours, which OSM data is too incomplete for.

## Decisions

**1. Branches from OpenStreetMap, stored in Postgres.**
- `StoreBranch { id, chain RetailerSlug, name, address?, lat, lon, osmId @unique, refreshedAt }`.
- `apps/worker/src/branches.ts` queries Overpass for `brand` in {D1, Jumbo, Éxito, Carulla} across Colombia, with a descriptive User-Agent (Overpass answers 406 without one). It maps brand to chain and upserts by `osmId`.
- It runs on deploy and then monthly; the worker already has a scheduler.
- *Alternative:* Google Places. Rejected: it needs an API key and billing, and its licence forbids storing results.
- *Alternative:* the chains' own store locators. Rejected: four different undocumented sources to maintain before Nov 4.
- *Missing branch:* the anchor can be the person's location or a typed address, geocoded through Nominatim with a User-Agent, at most 1 request per second. The chain is still chosen, so prices still apply.

**2. Street routing with OSRM, behind an interface.**
- `RouteProvider` in `packages/routing` (new, small):
  - `route(points, mode)` returns `{ distanceM, durationS, legs: [{ distanceM, durationS, steps }], geometry }`;
  - `table(origins, destinations, mode)` returns durations and distances.
- **First implementation:** the FOSSGIS public OSRM servers at `https://routing.openstreetmap.de/{routed-foot|routed-car|routed-bike}/`, which work today with no key (tested 2026-10-28: Chapinero, 880 m straight line, 1,194 m and 16 minutes on foot, 1,429 m and 4 minutes by car).
  - `route/v1` with `overview=full&geometries=polyline6&steps=true`, for the drawn line and the steps;
  - `table/v1` to rank branches.
- **Mode → profile:** walking → foot; moto and car → car; bus → car, with duration × 1.6 plus 8 minutes waiting (a typical Bogotá ratio, labeled "estimado, sin horarios"). Bike isn't offered yet.
- **Fair use:**
  - a User-Agent;
  - calls only from the server, never from each phone;
  - one `table` call to shortlist branches and one `route` call per offered option;
  - results cached for 7 days by rounded coordinates and mode;
  - at most 2 concurrent requests;
  - 5 s timeout.
- *Alternatives:*
  - Google Routes API: real transit and traffic, but it needs a key and billing. The user chose free routing for now, and the interface lets it be added later for bus.
  - OpenRouteService: needs a key.
  - Self-hosted OSRM: the Colombia extract needs about 2 GB RAM on the shared server. It's the next step if the public server's fair use becomes a limit.
- Straight-line distance (haversine) is used only to shortlist the 5 closest branches per chain before the `table` call, never shown or priced.

**2b. Cost from the route, in `packages/core/src/route-cost.ts` (pure).**
- The extra time and distance of a stop come from routes: start→anchor→B (or start→B→anchor, whichever is shorter) minus start→anchor. Without the person's location, anchor→B→anchor.
- Cost:
  - walking: 0;
  - bus: fare × extra rides (1);
  - moto or car: extra route km × cost per km, plus parking for the car.
- Defaults are editable and stored on the device: fare $3.200, moto $250/km, car $600/km, parking $3.000.
- Limits are by extra route minutes: 20 on foot, 30 by bus, 25 by moto or car.
- **Steps in Spanish:** `stepText(step)` turns an OSRM maneuver (type, modifier, street name, distance) into "Gira a la derecha en la Calle 57 · 200 m". It's a small table of maneuver types and modifiers, unit-tested, with no model involved.

**3. Options come from the existing optimizer, forced per store set.**
- `routeOptions(items, anchor, branches, travel)`:
  - option A is `optimize(items, { forceStores: [anchor.chain] })`;
  - for each other enabled chain with a branch within the limit (the one adding the least route time, from the `table` call), one option `optimize(..., { forceStores: [anchor.chain, chain] })`.
- Each option carries:
  - the goods total and its saving against A;
  - the extra route km, minutes and travel cost, and the net saving;
  - the items the anchor doesn't carry;
  - the route itself (legs, steps, geometry).
- A chain whose route fails is left out, with a reason.
- With an anchor the flat `tripCost` isn't used; the travel cost is the stop cost. Without an anchor, `optimize` runs unchanged.
- *Alternative:* add a per-store cost inside `optimize`. Rejected for now: forcing the few sets is simpler, exact for anchor plus one, and leaves the tested optimizer untouched.

**4. Muse recommendation: `apps/web/src/server/route-advice.ts`.**
- **Input**, as a numbered option list:
  - label, net saving, extra minutes, travel cost and distance;
  - item counts at each stop, and flags for cold and heavy items;
  - the travel mode and the person's note, up to 200 characters.
- **Output schema:** `{ choice: integer | null, question: string | null, explanation: string, itemOrder: { stop: integer, items: string[] }[] }`.
- **Validation:**
  - `choice` must be an offered index, unless `question` is set;
  - every number in `explanation` must be one of the given figures. Formatted pesos, minutes and meters are extracted and compared.
- Otherwise, or on `MuseUnavailable`, the rule fallback applies: largest net saving ≥ $3.000 and ≥ 5% of A, else A. It uses a fixed template.
- **Follow-up:** a `question` is shown with quick answers when it's yes/no. The answer is appended to the note and the advice reruns, at most once per plan.
- Effort "low", with a cache for the same options and note.
- *Alternative:* the rule only. Rejected: "voy con bebé a pie" or "tengo carro pero no hay parqueadero" is exactly the judgment the user wants Muse for.

**5. Cold and heavy items.**
- Aisle data already marks dairy, frozen, meat and produce. Cold covers dairy, frozen, meat and fish.
- Heavy means a pack of 2 kg or 2 L or more, or a multipack; this is computed.
- The route puts the stop with more cold items last. When that conflicts with the shorter order, Muse's `itemOrder` and the explanation say to pick them up at the end.

**6. API and app.**
- **API:**
  - `GET /api/branches?near=lat,lon&chain=` or `?q=`: at most 20 results, with distance when `near` is given.
  - `POST /api/route-plan { listId, anchor: { branchId } | { lat, lon, chain }, travel, note }` streams NDJSON like `/api/plan`. Events: `options`, `advice` (or `question`), `verified`.
- **App:**
  - The plan tab gets a "¿A qué súper vas?" step: a chain chip row, a searchable branch list, "Usar mi ubicación" (`expo-location`, foreground only, optional), travel mode chips with an "Editar costos" sheet, and a note field.
  - The result shows:
    - Muse's explanation on top;
    - the map: the route polyline, numbered stop markers, and total km and minutes;
    - the stops as cards (branch, address, leg distance and minutes, items, total);
    - a collapsible "Indicaciones" step list per leg;
    - "Navegar".
- **Map component** (`components/route-map.tsx`, a platform split):
  - **Web (the PWA, the main client):** MapLibre GL JS with OpenStreetMap raster tiles and visible attribution, with the route line decoded from polyline6. Loaded only on the plan screen.
  - **Native:** `react-native-maps` with a `Polyline` and `Marker`s. Install with `npx expo install`, after reading the SDK 58 docs.
  - The OSM tile usage policy allows light use with attribution. Tiles are requested only while the map is on screen.
- **Navegar** (a sheet with two choices):
  - **Google Maps:** `https://www.google.com/maps/dir/?api=1&origin=<start>&destination=<last stop>&waypoints=<other stops>&travelmode=walking|driving|transit`;
  - **Waze:** `https://waze.com/ul?ll=<next stop>&navigate=yes`. Waze takes one destination, so it starts with the first stop and the plan offers "Siguiente parada" after it.

## Risks / Trade-offs

- **[A branch is missing from OSM, or misplaced]** Location or an address works as the anchor, and the plan shows the branch's address so a mistake is visible. The branch import logs counts per chain.
- **[Muse states numbers it wasn't given]** Validation rejects the answer, and the fallback is used. Tests cover an invented figure.
- **[Chain prices vs. branch prices]** The plan says so plainly, and a receipt from that branch later shows the real price.
- **[Location privacy]**
  - Coordinates are sent only with a route-plan request, rounded to about 100 m, and not stored.
  - A typed address is geocoded and not stored.
  - The note is sent to Muse and not stored.
- **[The public OSRM server is slow, down, or limits us]**
  - 5 s timeouts, and routes cached for 7 days;
  - an option whose route fails is left out, with a reason, never estimated with a straight line;
  - the `RouteProvider` interface allows a self-hosted OSRM (Colombia extract) if usage grows.
- **[Bus times are estimates]** They are labeled "estimado, sin horarios", and Google Maps transit takes over for real guidance through "Navegar".
- **[A map library adds bundle weight]** MapLibre (about 200 KB gzipped) is loaded lazily on the plan screen only, on web. Native uses the platform map.
- **[Overpass or Nominatim limits]** Branches are imported in a single nightly or monthly query, not per user. Geocoding happens only for typed addresses, at most 1 per second, and is cached.
- **[Time before Nov 4]** This lands after `cross-store-product-match`. If time is short, the fallback rule ships first and Muse advice is added after. The spec already allows that.

## Migration Plan

1. Migration: create `StoreBranch`. Run the branch import once on production, and check counts per chain.
2. Deploy the API and worker, then the app.

Rollback: the previous images ignore `StoreBranch`. Plans without an anchor are unchanged.

## Open Questions

None blocking. The bus ratio and wait, the minute limits and the default costs are first values, editable by the person and tunable from feedback.
