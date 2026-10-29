# Tasks

## 1. Retailer client hardening

- [x] 1.1 Replace the 300 ms interval in `packages/retailers/src/vtex.ts` with a shared per-host pacer (≥2 s, set by `RETAILER_MIN_INTERVAL_MS`) plus retry with exponential backoff on empty bodies and 5xx (max 3 attempts). Verify with a unit test that uses a mocked `fetch` returning an empty body twice, then JSON.
- [x] 1.2 Add `byIds(skuIds[])` using repeated `fq=skuId:` parameters, chunked at 30 SKUs. Verify with a `LIVE=1` test that fetches 3 known D1 SKUs in a single request and gets all 3 back.
- [x] 1.3 Parse Jumbo `ProductData` unit metadata (`measurement_unit_un`, `unit_multiplier_un`) into `Offer.size`, falling back to `parsePackageSize`. Check whether D1 exposes an equivalent and record the finding in `docs/data-feasibility.md`. Verify with fixture-based unit tests for both retailers.

## 2. Optimizer core (`packages/core/src/optimizer/`)

- [x] 2.1 Define the input/output types: `PlanItem`, `Candidate`, `PlanOptions` (`tripCost`, `retailers`), `Plan`, `PlanLine`, `Unavailable` and `Alternatives`. All money is integer COP. Verify `pnpm --filter @rinde/core typecheck` passes.
- [x] 2.2 Implement candidate filtering: unit-kind compatibility, the substitution rule (literal matches only when substitution is disallowed) and `pinnedListingId`. Verify with unit tests for the substitution-disallowed and substitution-allowed scenarios in the spec.
- [x] 2.3 Implement the pack math and the choice per item within a store subset (`lineTotal = ceil(q/size) × price`, deterministic tie-breaks). Verify with tests for the lentils 454 g vs 500 g case and the 30 eggs from 15-trays case.
- [x] 2.4 Implement subset enumeration with trip cost, counting only stores actually used, deduplicating collapsed subsets and picking the best plan per stop count. Verify with tests for the three trip-cost scenarios: saves more, saves less, and cost 0.
- [x] 2.5 Implement the baseline (single store, literal matches only, excluding items with no literal match from both sides) and the savings description. Verify with a test asserting `baselineTotal`, `savings` and the description text.
- [x] 2.6 Implement per-line reasons ("X más barato que en Y" / "solo disponible en Y") and grouping by store with subtotals, total and remaining budget. Verify with tests that subtotals add up to the total and that the 200.000 / 171.350 → 28.650 example passes.
- [x] 2.7 Add a determinism test: optimize the same fixture twice and the outputs are deep-equal.

## 3. Budget trade-offs (`packages/core/src/optimizer/tradeoffs.ts`)

- [x] 3.1 Generate proposals (add a stop, allow another brand, smaller amount, drop) respecting the essential flag, with stable `proposalKey`s, plus `applyTradeoff` to apply one to the list and options (including `forceStores`). Verify with a test that an essential item never gets a smaller-amount or drop proposal.
- [x] 3.2 Compute each proposal's saving by re-running the optimizer with the change applied, discard proposals that save nothing, rank (full-quantity proposals, then smaller amounts, then drops; larger savings first) and return the top 5. Verify with the ranking test (allowing another brand at 3.000 is listed before a drop at 6.000) and the add-a-stop scenario.
- [x] 3.3 Exclude rejected `proposalKey`s and return no proposals when within budget. Verify with unit tests.

## 4. Persistence

- [x] 4.1 Extend the Prisma schema per design D8 and run `pnpm db:migrate --name trip-planner`. Verify the migration applies cleanly on the dev database (`docker-compose.dev.yml`) and `pnpm typecheck` passes.

## 5. Candidate provider (interim, snapshot-based)

- [x] 5.1 Implement `CandidateProvider` in `apps/web/src/server/candidates.ts`, building on the existing snapshot search in `apps/web/src/server/offers.ts` (accent-insensitive, all tokens must match), filters by unit kind and brand, and uses the latest `PriceObservation` per listing. It sets `isLiteralMatch` and `isSubstitute`. Verify with an integration test against the dev DB: "arroz 1 kg" returns rice candidates from both D1 and Jumbo, and no non-rice items in the top 5.

## 6. Live verification

- [x] 6.1 Implement `verifyPlan(plan, { signal, onProgress })`:
  - batched `byIds` per store, in parallel across stores
  - new `PriceObservation` rows with source `<retailer>:live-verify`
  - the 36 h staleness fallback
  - the 20 s budget via `AbortSignal.timeout`

  Verify with unit tests using a fake retailer for four cases: price changed, item out of stock, retailer error with a fresh snapshot, and retailer error with a stale snapshot.
- [x] 6.2 Implement the optimize → verify → re-optimize loop (at most 2 rounds). Verify with a test where a live price increase flips an item to the other store.

## 7. API

- [x] 7.1 Add `POST /api/plan` (Node runtime) that streams NDJSON progress events and then the final plan, and persists `OptimizedBasket` and `BasketItem`s. Verify with `curl -N` against `pnpm dev`: progress lines appear before the plan line, and the rows exist in the DB.
- [x] 7.2 Add `POST /api/plan/[basketId]/tradeoffs/[proposalId]` for accept/reject, which persists a `TradeoffDecision`, applies the change and re-plans with streaming. Verify with `curl`: after accepting, the new total drops by the proposal's saving, and a rejected proposal does not come back.

## 8. Plan screen (Expo client, `apps/mobile`)

- [x] 8.1 Build the plan screen in `apps/mobile` (Expo; web PWA + native), calling `POST /api/plan` via `lib/api.ts`:
  - stop-count switcher (1 / 2 / 3 stops with totals)
  - per-store pick lists in visit order, each line showing product, packs, price, reason, provenance label and product link
  - totals, remaining budget, savings with the baseline description
  - unavailable section

  Verify in the exported web PWA at 375 px width with a seeded list.
- [x] 8.2 Render live verification progress from the stream ("Verificando D1… 9/9 ✓"). Verify it is visible during a real plan run.
- [x] 8.3 Add the over-budget trade-off panel with accept/reject buttons that recalculate in place. Verify a 150.000 budget run reaches "dentro del presupuesto" after accepting proposals.

## 9. End-to-end check

- [x] 9.1 Seed a realistic 15-item family list (Colombian staples) with a 200.000 COP budget. Run the full flow on a fresh worker snapshot and confirm:
  - at least one item is split to a second store
  - every price has provenance
  - savings match a hand calculation from the stored observations

  Record the result in `docs/` as the demo baseline.

  Done 2026-10-29 on production (web `ebba7c3`, app `4431828`), in the PWA at 375 px. Pasting the 15-item list with café, plátano and atún optional at $150 mil showed "Verificando D1… 11 precios en vivo" while planning. The plan priced 15/15 items, $27.975 over budget. Accepting "Quitar café" and then "Quitar plátano" recalculated in place to $147.500, within budget. Baseline and hand check: `docs/demo-baseline.md`.
