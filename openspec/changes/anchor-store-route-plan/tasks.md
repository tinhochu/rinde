# Tasks

## 1. Branch data

- [ ] 1.1 Add `StoreBranch` (chain, name, address, lat, lon, `osmId` unique, refreshedAt) with an additive migration. Verify: `prisma migrate dev` applies, and `pnpm -r typecheck` passes.
- [ ] 1.2 Add the branch import `apps/worker/src/branches.ts`:
  - an Overpass query for the four brands in Colombia, with a User-Agent;
  - brand → chain mapping, upsert by `osmId`;
  - counts per chain logged;
  - scheduled monthly and runnable by hand.

  Verify:
  - a unit test of the brand mapping on a recorded Overpass fixture;
  - a local run stores branches, with Bogotá-area counts close to D1 154, Carulla 37, Éxito 36, Jumbo 12.

## 2. Routing and route math

- [ ] 2.1 Add `packages/routing`: a `RouteProvider` interface and an OSRM client for `routing.openstreetmap.de`:
  - profiles foot and car;
  - `route` (polyline6, steps) and `table`;
  - User-Agent, 5 s timeout, at most 2 concurrent requests;
  - a 7-day cache by rounded coordinates and mode.

  Verify:
  - unit tests on recorded OSRM fixtures (route and table parsing, legs, steps);
  - an opt-in live test (`ROUTING_LIVE=1`): the Chapinero test pair gives about 1,194 m on foot, and more than the 880 m straight line.
- [ ] 2.2 Add `packages/core/src/route-cost.ts`:
  - the extra route minutes and km of a stop (with or without the person's location, and whichever order is shorter);
  - cost per mode, with the bus estimate (car duration × 1.6 + 8 min);
  - the minute limits;
  - `stepText` for Spanish steps.

  Verify with unit tests: walking costs $0; the car adds parking; a 45-minute bus detour is out of range; the shorter stop order is chosen; `stepText` covers the turn, roundabout, arrive and continue maneuvers.
- [ ] 2.3 Add `routeOptions(items, anchor, branches, travel, provider)`:
  - shortlist the 5 nearest branches per chain by straight line, then one `table` call to pick the branch adding the least route time;
  - one `route` per offered option;
  - `optimize(..., { forceStores })` for the goods, savings and net saving;
  - a failed route leaves that option out, with a reason.

  Verify with unit tests on a stubbed provider: no straight-line figure appears in the output; a failing route drops the option; plans without an anchor are unchanged (the existing optimizer tests pass).

## 3. Muse advice

- [ ] 3.1 Add `adviseRoute(options, travel, note)` in `apps/web/src/server/route-advice.ts`:
  - `museJson`, returning `{ choice, question, explanation, itemOrder }`;
  - checks that the choice is offered and that every number is a given figure;
  - the rule fallback (≥ $3.000 and ≥ 5%) with a template;
  - a cache.

  Verify with unit tests, Muse mocked: a valid choice; an invalid index → fallback; an invented figure → fallback; a question; `MuseUnavailable` → fallback; the prompt contains no item prices.
- [ ] 3.2 Run an opt-in live test with the real key on the spec's three scenarios (worth it on foot, "voy con bebé", a far store). Verify: the picks and explanations are recorded in the summary, and each passes validation.
- [ ] 3.3 Order items within stops and choose the stop order: cold and heavy items flagged, the cold-heavy stop last, and Muse's `itemOrder` applied when it is valid. Verify with a unit test on a list with milk and frozen peas.

## 4. API

- [ ] 4.1 Add `GET /api/branches` (`near` + `chain`, or `q`; at most 20; with distances). Verify with an integration test on seeded branches, routing stubbed: with `near`, results are ordered by route time and show route distance and minutes; the name search works without location.
- [ ] 4.2 Add `POST /api/route-plan`, streaming the `options`, `advice` or `question`, and `verified` events. It takes `anchor` as a `branchId` or as lat/lon plus chain (rounded, not stored), and geocodes a typed address through Nominatim with a cache. Each option includes its route (geometry, legs, steps). Verify with an integration test, with Muse, routing and live checks mocked: the events arrive in order, the options carry routes, and no coordinates are stored.

## 5. Mobile app

- [ ] 5.1 Build the "¿A qué súper vas?" step:
  - chain chips and a searchable branch list;
  - "Usar mi ubicación" (`npx expo install expo-location`, after reading the SDK 58 docs), optional;
  - travel mode chips, an "Editar costos" sheet saved on the device, and a note field.

  Verify: `npx tsc --noEmit`, and web screenshots with location denied and allowed (mocked), in light and dark mode.
- [ ] 5.2 Build the route plan screen:
  - Muse's explanation (or its question, with quick answers);
  - stop cards in order, with leg distance and minutes, items, totals and net saving;
  - a collapsible "Indicaciones" step list per leg;
  - the chain-price note and the bus-estimate label.

  Verify: `npx tsc --noEmit`, and screenshots of the "worth it" plan and the "stay at your D1" plan against the local API.
- [ ] 5.3 Add `components/route-map`:
  - web: MapLibre GL JS, lazily loaded, with OSM raster tiles, attribution, the decoded route line and numbered markers;
  - native: `react-native-maps` (`npx expo install`, after reading the SDK 58 docs) with a `Polyline` and `Marker`s.

  Verify: a web screenshot of a two-stop walking route that follows the streets and fits the viewport at 320 px and 1280 px; the native build typechecks.
- [ ] 5.4 Add the "Navegar" sheet:
  - Google Maps with origin, waypoints, destination and travel mode;
  - Waze to the next stop, with "Siguiente parada" after it.

  Verify with unit tests of the URL builders (walking, driving and transit modes, two stops), and opening the Google Maps link from the web build with both stops.

## 6. Release

- [ ] 6.1 Run the full checks: `pnpm -r typecheck`, the unit tests and the web integration tests. Verify: all pass, with outputs recorded in the summary.
- [ ] 6.2 Deploy:
  - build the `rinde-*` images;
  - patch the compose and restart (migrate creates `StoreBranch`);
  - run the branch import;
  - delete the old images.

  Verify on production:
  - the branch counts per chain;
  - a walking route plan from a real Bogotá D1 with Muse advice, a map route that follows the streets and Spanish steps;
  - "Navegar" opening Google Maps with both stops.
