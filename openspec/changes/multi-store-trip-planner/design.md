# Design

## Context

- **What exists** (commit `50be035`):
  - `packages/core/src/units.ts` parses package sizes from names: 87–93% coverage, 15 tests.
  - `packages/retailers` has VTEX clients for D1 and Jumbo, with search and lookup by EAN. Pacing is 300 ms.
  - `apps/worker` snapshots about 2.2k listings into `PriceObservation` (append-only, with source and `observedAt`).
  - `packages/db` has `ShoppingList`, `ShoppingListItem`, `OptimizedBasket` and `BasketItem`, all unused so far.
- **Facts verified on 2026-10-26** that shape this design:
  - VTEX legacy search treats repeated `fq=skuId:X&fq=skuId:Y` as **OR**. One request returns many SKUs, so live verification costs about one request per store.
  - Requests sent less than about 1 s apart get **empty 200 bodies** (throttling). `docs/vtex-price-ingestion.md` recommends at least 2 s pacing plus retries.
  - Jumbo exposes unit metadata in `ProductData` (`measurement_unit_un`, `unit_multiplier_un`). D1's equivalent has not been confirmed.
- There are three supermarkets at most (D1, Jumbo, optional Éxito), and a list has about 10–40 items.

## Goals / Non-Goals

**Goals:**
- An exact optimum for the problem as stated (store combination + per-item choice + trip cost), in milliseconds, deterministic, and unit-testable without a database or network.
- A planner that is independent of where candidates come from, so the LLM equivalence matcher can plug in later without changing the optimizer.
- Plan and verification progress streamed to the UI, so the agent's work is visible in the demo.

**Non-Goals:**
- Mixing pack sizes within one line (e.g. 1×1 kg + 1×500 g). Each line uses one listing × N packs.
- Per-store minimum spends, delivery fees, branch distance or routing.
- Cross-item effects such as "buy 2, get 1 free" promotions. Only the listed price is used.

## Decisions

### D1. Exhaustive enumeration of store combinations, then an independent minimum per item
For each non-empty subset S of enabled stores (at most 7 for 3 stores), each item independently takes the cheapest acceptable candidate whose store is in S. The subset's cost is the goods total plus `tripCost × (storesActuallyUsed − 1)`. The lowest cost wins.

**Why this is exact:** without minimum spends or cross-item promotions, items don't interact once S is fixed, so the per-item minimum is optimal. Every subset is tried, so the overall optimum is found.

**Counting stops:** stops count stores that are actually used. The S = {D1, Jumbo} plan might buy everything at D1. In that case it collapses into the 1-stop D1 plan and is deduplicated.

**Ties** are broken deterministically:
1. fewer stops
2. lower goods total
3. a fixed store order (d1 < jumbo < exito)
4. listing externalId

**Alternatives considered:**
- MILP/solver library: unnecessary for at most 7 subsets, and an added dependency.
- Greedy "cheapest per item, then merge": not optimal once trip cost matters.

### D2. Units and packs
- For each candidate, `packs = ceil(requested / size)` (existing `packsNeeded`), and `lineTotal = packs × price`. Candidates are compared on `lineTotal`. Price per unit is used only for explanations and trade-off ranking.
- The **unit source** resolution order is:
  1. retailer unit metadata (Jumbo `ProductData`; D1 if found)
  2. name parsing (`parsePackageSize`)
  3. otherwise, unusable for quantity math
- A candidate whose unit kind doesn't match the item's (g vs ml vs unit) is rejected.

**Alternative considered:** price-per-unit only, without pack math. Rejected because it understates the real cost when packs overshoot the request (the 454 g vs 500 g case in the spec).

### D3. Candidate provider interface
The optimizer takes `items[]` with `candidates[]` already resolved. Each candidate carries `listingId`, `retailer`, `price`, `size`, `observedAt`, `source`, `isLiteralMatch` and `isSubstitute`. A `CandidateProvider` in `apps/web` produces them.

- **Interim provider:** Postgres full-text/ILIKE search over the snapshot (`RetailerProduct.name`), filtered by unit kind and brand when given.
  - `isLiteralMatch` is set when the EAN or brand matches the request.
  - Substitutes are allowed only when the item allows substitution.
- **Later:** the Meta Muse equivalence judge re-ranks and filters the same structure.

**Why:** the optimizer is built and tested now. LLM quality work happens in parallel.

### D4. Baseline
The baseline is computed by the same optimizer: S fixed to each single store, with only `isLiteralMatch` candidates. The cheapest such single-store plan is the baseline. Items with no literal match in the baseline store are excluded from both sides, so the comparison covers the same items. The description string names the store.

### D5. Live verification by batched SKU lookup
- A new retailer method, `byIds(skuIds[])`, sends one request per store with repeated `fq=skuId:` parameters, chunked at 30 SKUs.
- The retailer client gets a shared per-host pacer (at least 2 s), with retries and backoff on empty bodies or 5xx.
- Flow:
  1. Optimize on the snapshot.
  2. Verify the chosen listings of all stores in parallel (different hosts).
  3. Write new `PriceObservation` rows (`source: "<retailer>:live-verify"`).
  4. If anything changed, re-optimize once with the updated observations, then verify only newly chosen listings, at most 2 rounds.
- Fallback and staleness follow the `plan-price-verification` spec. The 20 s overall budget is enforced with `AbortSignal.timeout`.

**Alternatives considered:**
- Per-item lookups: 25 items × 2 s exceeds the budget.
- No live check, snapshot only: weaker demo, and stale data is risky.

### D6. Trade-offs are generated deterministically, and the LLM only phrases them
Over budget, the generator enumerates, per item:
- the cheapest acceptable substitute (if allowed)
- the cheapest pack option covering the quantity
- quantity −1 step and drop (non-essential only)

Each proposal's saving is computed by **re-running the optimizer** with that change applied, which captures store-combination effects (a swap can remove the need for a second stop). Proposals are ranked per the spec, and the top 5 are returned.

- An optional Muse call phrases each proposal. The numbers are injected as variables, and any numbers in the generated text are validated against them.
- Accept and reject decisions are persisted (new `TradeoffDecision` rows). Accepting changes the `ShoppingListItem` (quantity, essential flag, or `pinnedListingId` for swaps) and triggers a full re-plan.

### D7. API shape and streaming
- **`POST /api/plan`:** takes `{ listId, tripCost?, retailers? }` and returns an **NDJSON stream**:
  - `{"type":"progress","store":"d1","checked":9,"total":9,"changed":0}` …
  - then a final `{"type":"plan", ...}`
- **`POST /api/plan/[basketId]/tradeoffs/[proposalId]`:** takes `{ decision: "accept" | "reject" }` and returns the same stream format.
- These are Next.js route handlers on the Node runtime.

**Alternatives considered:**
- Server Actions: can't stream progress as cleanly.
- WebSockets: unnecessary.

### D8. Persistence changes (one migration)
- **`OptimizedBasket` gains:**
  - `tripCost Int`, `stops Int`, `stores RetailerSlug[]`
  - `alternatives Json` (best plan per stop count)
  - `overBudget Int` (≥ 0)
- **`BasketItem` gains:**
  - `retailer RetailerSlug`, `packs`, `unitPrice`
  - `priceStatus enum { live, snapshot }`, `observedAt`
  - `reason String`
- **`ShoppingListItem` gains:** `pinnedListingId String?`, `dropped Boolean`.
- **New table:** `TradeoffDecision { id, listId, proposalKey, decision, createdAt }`. `proposalKey` is stable, e.g. `swap:<itemId>:<listingId>`.
- **Unavailable items:** `{ itemId, reason }` stored in `OptimizedBasket.assumptions`.

## Risks / Trade-offs

- [Interim candidate search is noisy ("aceite girasol" → tuna)] → Filter by unit-kind compatibility and a minimum token overlap. The demo list must be tested against it until the Muse matcher lands, and the matcher is the next change.
- [Retailer throttling during the live demo] → Pacing of at least 2 s per host, batched SKU lookups, the 36 h snapshot fallback, and a worker snapshot taken the morning of the demo.
- [Unit metadata missing or wrong for some listings] → Fall back to the name parser. Candidates with no usable size are excluded and reported, never guessed.
- [Trip cost is subjective] → It is user-adjustable, and every stop-count alternative is always shown, so the user can see what each extra stop saves.
- [Re-running the optimizer per trade-off proposal] → At most about 40 items × 4 proposal types × 7 subsets, still under 10 ms.

## Migration Plan

1. Add a Prisma migration (additive columns with defaults, plus the new table). Deployed by the existing one-shot `migrate` service in `docker-compose.yml`.
2. No backfill is needed: plans are created fresh per request.
3. Rollback: revert the commit. The migration is additive, so the old code ignores the new columns.

## Open Questions

- Default trip cost: 10.000 COP is a placeholder that roughly covers a bus round-trip plus time. Tune it after testing with real users. It is configurable, so the specs and tasks don't change.
- D1 unit metadata: if D1 exposes no structured unit field, D1 stays on name parsing. That's already the fallback path.
