# Tasks

## 1. Data model

- [x] 1.1 Add `ProductMatch` (`retailerProductId` unique, `fromProductId`, `toProductId`, `by` muse|rules, `reason`, `matchedAt`) to the Prisma schema with an additive migration. Verify: `prisma migrate dev` applies on local Postgres, and `pnpm -r typecheck` passes.
- [x] 1.2 Make product lookups by EAN follow `ProductMatch` (`fromProductId → toProductId`): `recordOffer` on create, receipt line matching, `listingsByEan`. Verify with an integration test:
  - after a listing is re-pointed, a later `recordOffer` and a receipt line carrying the old barcode both land on the shared product.

## 2. Same-product judgment

- [x] 2.1 Add `candidatesFor` (same size after unit conversion, same brand when both have one, same aisle, at most 8, ordered by shared name words) and the strict fallback `sameProduct` (brand, size and variety tokens equal; exactly one candidate) in `packages/core/src/match.ts`. Verify with unit tests:
  - entera vs. deslactosada;
  - 900 ml vs. 1 L (not a candidate);
  - six-pack vs. single;
  - no brand;
  - two strict matches → none;
  - real D1, Jumbo and Éxito names from the existing fixtures.
- [x] 2.2 Add `judgeSameProduct(product, candidates)` in `apps/web/src/server/same-product.ts`:
  - one `museJson` call at low effort, given names, brands and sizes only (no prices);
  - returns `{ pick | null, reason }`;
  - rejects a pick that is out of range or fails `candidatesFor`;
  - 6 h cache, which also caches "none";
  - strict-rule fallback on `MuseUnavailable`.

  Verify:
  - unit tests with a mocked `museJson`: pick; none; out-of-range index; size-mismatch pick rejected; Muse unavailable → rule; the prompt contains no price;
  - an opt-in live test (`MUSE_LIVE=1`, real key) on 5 real cross-store pairs, including a "Leche 2.0" near miss, with picks and reasons recorded in the summary.
- [x] 2.3 Add `matchByName(product, store)`: candidates from stored listings, then a live search at that store; then `judgeSameProduct`. On a match, re-point the listing and write `ProductMatch` with `by` and `reason`. Verify with an integration test (Muse mocked) using seeded listings with different barcodes: the product then shows both stores' prices in `compareProducts` and `priceBasket`, and the reason is stored.

## 3. Nightly cross-fill

- [ ] 3.1 Add `crossFill()` in `apps/worker/src/crossfill.ts`:
  - EANs with a current online observation, minus those already listed at each store;
  - patient `byEans` batches;
  - record with source `<slug>:cross-ean`;
  - per-batch failures logged, with an `IngestRun` row per store.

  Run it after `ingestAll()` in the scheduled job and in `dist/ingest.mjs`. Verify:
  - a unit test with a stubbed client (one batch fails, the others record);
  - a local run logs per-store counts.
- [ ] 3.2 Measure coverage on the local database before and after a cross-fill: products listed at 1, 2, 3 and 4 stores. Verify: the counts are recorded in the summary, and products at 1 store drop.

## 4. API

- [x] 4.1 `POST /api/products/:id/stores`:
  - stored current prices are returned without a request;
  - for the other stores, `byEans`, then `matchByName`, 15 s each, `patient: false`;
  - each store is `price` (with `reason` when matched by judgment), `not-sold` or `unchecked`.

  Verify with integration tests (live calls mocked):
  - found by barcode;
  - found by Muse judgment, with its reason;
  - both steps empty, or Muse picks none → `not-sold`;
  - 429 → `unchecked`, never `not-sold`;
  - Muse unavailable with several strict candidates → `unchecked`.
- [x] 4.2 Brand detection in `compareProducts`: products of other brands get `similar: true` and sort last. Add `similar?: boolean` and `reason?: string` to `ComparedProduct`. Verify: unit tests for the brand detector ("leche alpina" → ALPINA; "leche" → none; aisle words ignored), and an integration test where D1 Latti under "leche alpina" is `similar`.
- [x] 4.3 `GET /api/products/:id/similar`:
  - a pool of other brands or varieties in the same unit family, at most 30;
  - `valueGroups`, extended with a one-line reason per item, keeping the product's own kind;
  - ranked by unit price computed from stored prices and sizes, at most 6;
  - all `similar: true` with `reason`;
  - word-rule fallback without reasons.

  Verify:
  - an integration test with seeded milk listings, Muse mocked: "Leche 2.0" grouped with semidescremada, with its reason; the product itself is excluded; the order is by unit price;
  - a test that the Muse prompt carries no price;
  - the existing value-groups tests still pass.

## 5. Mobile app

- [x] 5.1 Product page:
  - a "Buscar en todas las tiendas" button when any enabled store lacks a price;
  - per-store spinner, then price, "No lo vende" or "No pudimos revisar · Reintentar";
  - the list refreshes with the new prices.

  Verify: `npx tsc --noEmit`, and web screenshots in each state (with mocked API responses), in light and dark mode.
- [x] 5.2 Show Muse's reason under a store price matched by judgment. Add a "Similares" section on the product page (store, price, unit price, reason, "Otro producto"), and a "Similar" chip on `similar` search cards. Verify: screenshots of "leche alpina" search and an "Arroz Diana 1 kg" product page against the local API.

## 6. Release

- [x] 6.1 Run the full checks: `pnpm -r typecheck`, the unit tests and the web integration tests. Verify: all pass, with outputs recorded in the summary.
- [ ] 6.2 Deploy:
  - build the `rinde-*` images at the commit;
  - patch the compose and restart (migrate creates `ProductMatch`);
  - run ingest plus cross-fill once;
  - delete the old images.

  Verify on production:
  - the coverage counts improve over the 2026-10-28 baseline (3,295 / 1,005 / 246 / 11);
  - "leche alpina" shows Alpina products with more than one store, and Latti labeled "Similar";
  - a product page check matches at least one store by Muse, with its reason, and Similares show reasons;
  - the product page check returns a state for every store.
