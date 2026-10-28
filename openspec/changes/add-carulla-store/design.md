# Design

## Context

- **Store list.** Stores are a closed list, `d1 | jumbo | exito`, repeated in about 20 places:
  - the Prisma `RetailerSlug` enum;
  - `packages/retailers` types and clients;
  - `packages/core` (optimizer `RetailerSlug`, `STORE_ORDER`, `STORE_NAMES`, `ReceiptStore`);
  - `packages/db` `RETAILERS`;
  - `apps/web` `contract.ts` (`Store`, `STORE_BY_SLUG`, `SLUG_BY_STORE`) and the `/api/catalog` zod enum;
  - `apps/mobile` `market.ts`, `planner.ts`, `theme.ts`, `shop.ts` and `brand.tsx`;
  - copy in the app, the API and the landing page.

  TypeScript's `Record<RetailerSlug, …>` types make most of these fail to compile until Carulla is added, which helps.
- **Éxito gating.** Éxito is gated by `INGEST_EXITO`, read in two places (Carulla will not be gated):
  - the worker's `ingestAll()`, through `retailers({ includeExito })`;
  - the web's `enabledRetailers()`.
- **VTEX client.** `createVtexClient` (`packages/retailers/src/vtex.ts`) already handles:
  - the `/io/api/` path;
  - per-host pacing (`minIntervalMs`) and the 429 cool-down;
  - batched `byEans` / `byIds` lookups.

  It picks an offer from the first seller that is available with a price. That can be a marketplace seller: about 13% of Carulla items and 22% of Éxito items in the 2026-10-28 sample.
- **Shared catalog.** Carulla and Éxito share one VTEX catalog: the same productId, skuId, EAN and name, with different price tables. Products are grouped across stores by EAN, so Carulla listings group with Éxito's (and D1's and Jumbo's) without new matching work.
- **Store detection.** Receipt photos go through `detectStore()`, and e-invoices through `invoiceStore()`. Both currently reject Carulla as a sister chain. `packages/core/src/einvoice/fixtures/carulla.xml` is a real-shape Carulla invoice: NIT 890900608, banner "CARULLA EXPRESS EDS EL RETIRO".

## Goals / Non-Goals

**Goals:**
- Add Carulla in one pass, so no part of the app lists three stores while another lists four.
- Make every per-store list fail to compile when a store is missing.
- Fix marketplace-seller prices for Éxito at the same time, because it is the same code path.

**Non-Goals:**
- A generic "add a store by config" system. Four stores is still a short closed list.
- Regional prices. Like Éxito, Carulla is read in its default region (no `sc` or region cookie). Branch-level prices still come from receipts.
- Other Grupo Éxito banners (Surtimax, Super Inter, Surtimayorista): still rejected.
- Matching Carulla to Éxito listings by skuId. EAN grouping already covers it, and a skuId link would only add a second path.

## Decisions

**1. Carulla is its own `RetailerSlug` value, `carulla`.**
- It gets its own `Retailer` row, `RetailerProduct` rows and observations.
- *Alternative:* store Carulla as a price list on Éxito's listings. Rejected: everything downstream keys offers by retailer (comparisons, plans, rewards gap bonus, receipt dedupe `headerKey`). A separate store needs no special cases there.
- The Prisma migration adds the enum value (`ALTER TYPE "RetailerSlug" ADD VALUE 'carulla'`), which is additive.

**2. Carulla is always on; one helper lists the enabled stores.**
- No `INGEST_CARULLA` flag (product decision, 2026-10-28). A single `enabledStores(env)` helper in `packages/retailers` returns D1, Jumbo and Carulla always, plus Éxito when `INGEST_EXITO=1`, in `STORE_ORDER`.
- Both the worker's `ingestAll()` and the web's `enabledRetailers()` call it, so the two can't drift. `retailers({ includeExito })` is replaced by `retailers(enabledStores())`.
- *Alternative:* an `INGEST_CARULLA` flag like Éxito's. Rejected by the product owner: Carulla should simply be ingested.

**3. Carulla client mirrors Éxito.**
```
carulla = createVtexClient({ slug: "carulla", name: "Carulla", baseUrl: "https://www.carulla.com",
  searchPath: "/io/api/catalog_system/pub/products/search", minIntervalMs: 5000, ownSellerId: "1" })
```
- Carulla's host is separate, so the per-host pacer lets Éxito and Carulla ingest in turn without slowing each other.
- Ingest order is `STORE_ORDER`: D1, Jumbo, Éxito, Carulla.
- Sizes: Carulla names carry the size in the same "(1000 gr)" form as Éxito's, which `parsePackageSize` already reads. The live test checks it.

**4. Own-seller pricing (`ownSellerId`).**
- A new optional `ownSellerId` on the VTEX config, set to `"1"` for Éxito and Carulla.
- When set, the offer uses only that seller's `commertialOffer`. If that seller is missing, has no price, or is unavailable, the item is reported as not available, with no price. It is never filled from another seller.
- D1 and Jumbo keep today's behavior: no marketplace was seen there.
- *Alternative:* filter by seller name. Rejected: names vary in case ("carulla" / "Carulla"), and seller id `1` is the VTEX convention for the account's own store, which both sites confirmed in the sample (500/500 and 503/503 items).

**5. Store detection on documents: Carulla before Éxito.**
- `detectStore`: remove `carulla` from `OTHER_CHAINS`, and test `/carulla/` before `/exito/`, because a Carulla receipt also prints "Almacenes Éxito".
- `invoiceStore`: NIT 890900608 maps to `carulla` when the banner matches `\bcarulla\b`, to `exito` when it matches `\bexito\b` and not Carulla, and still rejects Surtimax, Super Inter and Surtimayorista. The COMPANIES table entry becomes a list of `{ store, allow }` per NIT, with a shared reject list.
- The test that expects "CARULLA EXITO" to be rejected changes to expect Carulla.

**6. Planner.**
- `STORE_ORDER` gets `carulla` last. The exact subset search goes from 7 to 15 store sets, which is still trivial.
- The "≤ 7 for 3 stores" comment is updated.
- `shop.ts` `stores` max goes from 3 to 4.
- `verify-progress.tsx` `DEFAULT_STORES` stays D1 and Jumbo, the always-on stores.

**7. Badge.**
- Carulla gets a text badge in `theme.stores`, with `brand.tsx` falling back to it by slug instead of the current Éxito/Jumbo/D1 ternary.
- A logo image like the other three can replace it later, if one is sourced the same way as the others.
- Colors: Carulla's dark green with a white label, contrast-checked in light and dark mode.

**8. Copy.**
- Every "D1, Jumbo y Éxito" / "Éxito, Jumbo y D1" string becomes the four-store form from the spec. These strings are found by grepping for `Jumbo`.
- That covers the landing `landing-copy.ts`, `Index.tsx` store strip, `prerender.mjs` descriptions and the OG image text (no change needed, it names none).

## Risks / Trade-offs

- [Carulla starts rate-limiting at 5 s] → Same 429 cool-down as Éxito; failures are logged per term and don't stop the other stores. Turning Carulla off would need a code change (no flag, by decision).
- [Own-seller rule hides some Éxito products that today show a marketplace price] → Correct by the "never a price the store didn't set" rule. Fewer Éxito matches is the expected outcome, and the plan says "not available at Éxito".
- [The first production ingest doubles the 5 s-paced time (Éxito plus Carulla)] → The stores run one after the other on separate hosts, and the job is daily at 05:00. A first manual run fills Carulla right after deploy.
- [Branch-level price differences in Carulla stores] → Online prices are the default region's, as with Éxito. Receipts add branch prices, labeled with the branch.
- [Postgres enum `ADD VALUE` can't run inside a transaction with later uses of the value] → The migration only adds the value. Rows are created at runtime by `ensureRetailer`.
- [Planner tries more store sets] → 15 sets × items is negligible.

## Migration Plan

1. Merge the code and the migration, and build the images.
2. Deploy, with `migrate` running `prisma migrate deploy` first, as today.
3. Restart.
4. Run one ingest so Carulla has fresh prices before users see it (the web hides stores with no fresh offers per item anyway).
5. Redeploy the landing page with the new copy.

Rollback: redeploy the previous images. The enum value and Carulla rows stay, which is harmless; old code ignores them because it never asks for Carulla.

## Open Questions

- A Carulla logo image for the app badge, versus the text badge. Cosmetic: it can be swapped later without touching specs or tasks beyond 7.
