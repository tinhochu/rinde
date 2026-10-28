# Tasks

## 1. Store list and data model

- [x] 1.1 Add `carulla` to the Prisma `RetailerSlug` enum and create the migration, which only does `ADD VALUE 'carulla'`. Add Carulla to `packages/db` `RETAILERS`, with name "Carulla" and base URL `https://www.carulla.com`. Verify: `prisma migrate dev` applies on local Postgres, and the generated client's `RetailerSlug` includes `carulla`.
- [x] 1.2 Add `carulla` to the `RetailerSlug` types in `packages/retailers` and `packages/core`. Add `"carulla"` to `ReceiptStore` and append `carulla` / "Carulla" to `STORE_ORDER` and `STORE_NAMES`. Update the "≤ 7 for 3 stores" comment. Verify: `pnpm -r typecheck` lists every remaining place that needs Carulla, and those are fixed in the tasks below.

## 2. Catalog ingest

- [x] 2.1 Add an `ownSellerId` option to `createVtexClient`. When it is set, the price, list price, stock and availability come only from that seller, and the item is unavailable when that seller doesn't sell it. Set `ownSellerId: "1"` on Éxito. Verify: unit tests with recorded fixtures cover these cases:
  - own seller only;
  - own seller plus a cheaper marketplace seller (the own price wins);
  - only a marketplace seller (unavailable, no price).
- [x] 2.2 Add the `carulla` client: the `/io/api/` search path, `minIntervalMs: 5000` and `ownSellerId: "1"`. Add it to `retailerBySlug`. Verify:
  - a recorded `carulla-search.json` fixture test parses name, EAN, size ("(1000 gr)") and price;
  - the live test (`vtex.live.test.ts`, opt-in) gets at least one priced Carulla "leche" offer.
- [x] 2.3 Add `enabledStores(env)` in `packages/retailers`: D1, Jumbo and Carulla always, Éxito when `INGEST_EXITO=1`, in `STORE_ORDER`. Use it in the worker's `ingestAll()` and the web's `enabledRetailers()`, replacing `retailers({ includeExito })`. Verify: unit tests for the flag combinations, and `candidates.int.test.ts` still passes.
- [x] 2.4 Run ingest locally. Verify: `pnpm --filter @rinde/worker ingest` logs a Carulla offer count, and the database has Carulla observations with `sourceUrl` on carulla.com.

## 3. API

- [x] 3.1 Update `apps/web` `contract.ts` (`Store`, `STORE_BY_SLUG`, `SLUG_BY_STORE`) and the `/api/catalog` `store` enum. Update the user-facing copy in `receipts.ts` and `reply.ts` to the four-store wording. Verify:
  - `GET /api/catalog?q=leche` returns Carulla offers;
  - `?store=Carulla` filters to Carulla.
- [x] 3.2 Verify comparisons and planning end to end on local data: a basket whose items are cheapest at Carulla gets a plan with a Carulla stop, and basket totals include a Carulla column. Verify: an integration test with seeded observations (Carulla cheapest) asserts the recommended plan uses Carulla.

## 4. Receipts and e-invoices

- [x] 4.1 Update `detectStore`: remove Carulla from `OTHER_CHAINS` and detect Carulla before Éxito. Verify with receipt tests:
  - "Carulla" and "CARULLA - ALMACENES EXITO S.A." map to `carulla`;
  - "Surtimax" is still null;
  - Éxito receipts are still `exito`.
- [x] 4.2 Update `invoiceStore`: NIT 890900608 maps to Carulla or Éxito by banner, with the sister-chain rejects kept. Verify with e-invoice tests:
  - `carulla.xml` maps to `carulla` with branch "CARULLA EXPRESS EDS EL RETIRO";
  - "SURTIMAX CALDAS", "SUPER INTER PALMIRA" and "SURTIMAYORISTA ITAGUI" are still rejected;
  - the old "CARULLA EXITO" reject case now expects `carulla`.
- [x] 4.3 Run a Carulla e-invoice through the web intake. Verify with an integration test in `einvoice.int.test.ts`:
  - a fresh `carulla.xml` is accepted as store `carulla`;
  - its lines match Carulla listings by EAN when present;
  - the same CUFE from a second account is rejected (one invoice, one account);
  - the first Carulla price earns the gap bonus labeled "Primer precio en Carulla".

## 5. Mobile app

- [x] 5.1 Update the store lists:
  - `lib/market.ts` (`Store`, `STORES`);
  - `lib/planner.ts` (`RetailerSlug`, `STORE_NAME`);
  - `lib/shop.ts` (`stores` enum plus Carulla, max 4);
  - `app/receipt.tsx` `SAMPLE_NAME`.

  Verify: `npx tsc --noEmit` in `apps/mobile` is clean, and a saved draft with four stores loads.
- [x] 5.2 Add a Carulla badge to `theme.stores` (dark green, white label) and make `StoreLogo` fall back by store name, not the Éxito/Jumbo/D1 ternary. Verify: web screenshots of a comparison card with a Carulla offer in light and dark mode, with the badge contrast at AA.
- [x] 5.3 Update the copy that lists stores to the four-store wording: search, home, receipt rules, contributions, e-invoice card, about dialog and the search field label. Verify: `grep -rn "Jumbo" apps/mobile/app apps/mobile/components` shows Carulla in every store-list string.

## 6. Landing page

- [x] 6.1 Update `landing-copy.ts` (intro, sources, disclaimer, es and en), the `Index.tsx` store strip (four names, still fitting at 320 px), and the `prerender.mjs` descriptions. Verify:
  - `pnpm --filter @rinde/landing build && pnpm --filter @rinde/landing test` pass;
  - screenshots at 320 px and 1280 px show the strip without horizontal scroll;
  - the live receipt can show a Carulla row.

## 7. Release

- [x] 7.1 Run the full checks: `pnpm -r typecheck`, the unit tests and the web integration tests. Verify: all pass, with outputs recorded in the summary.
- [ ] 7.2 Deploy:
  - build `rinde-web`, `rinde-worker`, `rinde-migrate`, `rinde-app` and `rinde-landing` at the commit;
  - patch the compose with the new tags, then restart (migrate applies the enum value);
  - run one ingest;
  - delete the old images.

  Verify:
  - production `/api/catalog?q=leche` returns Carulla offers with carulla.com sources;
  - the landing page names four stores;
  - the app shows the Carulla badge.
