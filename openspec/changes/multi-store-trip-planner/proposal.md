# Proposal

## Why

Rinde's core promise is "haz que tu plata rinda más": tell a household exactly **what to buy where**, even when that means going to two supermarkets. The Oct 26 probe found spreads of up to 28% on identical products, and no single chain was always cheapest (D1 won most items, Éxito won Avena Alpina, Jumbo won Bonyurt). On top of that, D1's store brands open up savings through equivalent swaps. The data shows a real split-basket opportunity, and this trip plan is the decision the judges should see. A dashboard would not be enough.

## What Changes

- **Trip plan optimizer:** a new deterministic optimizer in `packages/core`.
  - It considers every combination of the available supermarkets (D1 and Jumbo; Éxito when enabled).
  - For each combination, it assigns each list item to the cheapest acceptable candidate.
  - It adds a cost for each extra trip, so a second stop is recommended only when it pays off.
  - It returns the best plan plus alternatives (1 stop vs 2 stops vs 3 stops) with their savings.
- **Quantity math:**
  - Price per unit comes from the retailer's PUM specification when available, falling back to the existing name parser in `packages/core/src/units.ts`.
  - Pack counts must cover the requested quantity.
- **Rules the plan respects:**
  - **Essential items** must be covered.
  - **Substitution** is used only for items where the user allows it.
  - **The budget** is enforced as a hard limit.
- **Budget trade-offs:** when the cheapest feasible plan is still over budget, the planner generates trade-offs the user can accept or reject: switch to the store brand, use a smaller pack, or drop a non-essential item. Each one has an exact peso effect, and the plan recalculates after every decision.
- **Live price verification:** before a plan is shown, the prices of the chosen items are re-fetched live. If a re-check fails, the snapshot price is shown labeled with its age. Snapshot prices older than 36 h cannot appear without a successful live check.
- **Plan output:**
  - per-store pick lists in visit order
  - a reason for each item (e.g. "$1.200 más barato que en Jumbo")
  - totals per store and overall, and the budget remaining
  - savings against a defined baseline: the single cheapest store, the items exactly as written, no substitutions
  - unavailable items, each with a reason
- **API and UI:** a plan API route and a mobile plan screen in `apps/web` that render this output.

## Capabilities

### New Capabilities
- `trip-planning`: Turns a confirmed shopping list and budget into a multi-store purchase plan. Covers store-combination selection, extra-trip cost, pack math, essential and substitution rules, the savings baseline, and the plan output contract.
- `plan-price-verification`: Ensures every price in a plan comes from a stored or freshly fetched observation that carries a source and timestamp. Covers live re-checks, fallbacks and the staleness rule.
- `budget-tradeoffs`: Generates, applies and recalculates over-budget trade-off proposals that the user accepts or rejects.

### Modified Capabilities
<!-- None: no existing specs in openspec/specs/. -->

## Impact

- **`packages/core`:**
  - new `optimizer/` module (pure TypeScript, unit-tested)
  - `units.ts` gains PUM-aware unit pricing
- **`packages/retailers`:** read the PUM specification. Add a lookup by product ID for live re-checks, with pacing of at least 2 s and retry/backoff, following `docs/vtex-price-ingestion.md`.
- **`packages/db`:**
  - `BasketItem` needs `retailerSlug` and the price `verifiedAt`/`source` kind
  - `OptimizedBasket` stores the chosen store combination, the stop count, the trip cost used and the alternatives
  - this needs a migration
- **`apps/web`:** `POST /api/plan` (optimize), `POST /api/plan/:id/tradeoffs/:tradeoffId` (accept/reject), and the plan screen.
- **Dependencies on other changes:**
  - The planner consumes **candidate products per list item**. Turning list text into candidates (Meta Muse equivalence judging) and list input or parsing are separate changes.
  - Until those land, candidates come from snapshot search plus unit-compatibility filtering behind the same interface, so the planner can be built and tested now.
- **Out of scope:**
  - store-branch geolocation and routing
  - delivery fees
  - Éxito access (stays behind `INGEST_EXITO`; the decision is pending)
  - the full category crawl, which is a separate ingestion change
