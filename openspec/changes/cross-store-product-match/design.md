# Design

## Context

- **Grouping.** A product is a `Product` row, unique by EAN. Each store's listing (`RetailerProduct`) points to one product. `recordOffer` finds or creates the product by EAN on first sight, and never changes a listing's `productId` afterwards.
- **Search** (`apps/web/src/server/compare.ts`) groups offers by EAN. For the barcodes on screen, it then calls `lookupMissingEans`, a live `byEans` per store (8 s timeout). When Éxito or Carulla fail, the product's `missing` stores stay unknown ("puede tenerlos").
- **Baskets and the product page** (`basket.ts`, `fetchBasket([id])`) key by product id and do the same live EAN lookup.
- **Store limits.** `byEans` sends batches of 30 OR-ed `fq=alternateIds_Ean:` filters. Pacing is per host: D1 and Jumbo 2 s, Éxito and Carulla 5 s, with a 30 s cool-down after a 429.
- **Production gap (2026-10-28).** 4,557 products have a barcode: 3,295 are listed at one store, 1,005 at two, 246 at three and 11 at four.
- **Search fallback.** `findOffers` drops trailing query words per store until something matches. That is how D1's Latti milk appears under "leche alpina", with the reason "sin 'leche alpina'; mostramos resultados para 'leche'". The reason is shown, but the products aren't marked.
- **Text helpers already in `apps/web`:** `searchTokens`/`stem` (offers.ts), the `PACKAGING` and filler word lists (relevance.ts), and `parsePackageSize` (core), which turns sizes into g, ml or units.
- **Muse is already used for judgments.** In each case Muse sees names and sizes, never prices, and a word-rule fallback takes over when it fails:
  - `muse.ts` provides `museJson`: a strict JSON-schema call, zod-validated, retried once, and throwing `MuseUnavailable` when there's no key or no answer;
  - `value-groups.ts` groups search results into interchangeable kinds;
  - `kind-judge.ts` filters a list item's candidates.

  Both cache for 6 h.

## Goals / Non-Goals

**Goals:**
- Most cross-store prices are already stored before anyone searches, so search no longer depends on live lookups during the day.
- Muse reasons about "same product" across different barcodes and store naming. Hard checks keep it honest, and the verdict and its reason are remembered.
- The product page gives each store a definite answer, or says honestly that the store couldn't be checked.

**Non-Goals:**
- Nightly Muse matching for every product. Judgment runs on demand (product page) and is remembered. Every product at every store each night would be too many store requests and model calls.
- Muse seeing or reasoning about prices. It judges identity and kind only; the app computes unit prices from stored prices and sizes.
- Merging produce or eggs. They already have their own grouping (canonical produce items, egg grade and count).
- Receipt-only products. Cross-fill covers online listings. Receipt prices still join groups by EAN as they do today.

## Decisions

**1. Cross-fill runs in the worker, after `ingestAll()`.**
- New `crossFill(stores)` in `apps/worker/src/crossfill.ts`:
  1. Take every EAN with a current online observation (within `ONLINE_PRICE_HOURS`).
  2. For each enabled store, keep the EANs whose product has no current listing *at that store*.
  3. Call `client.byEans()` patiently, in batches of 30.
  4. Record each offer with source `<slug>:cross-ean` and the request URL.
- Stores run one after another, like the ingest. At most 4,557 EANs means 152 requests per store: about 5 minutes for D1 or Jumbo, and 13 for Éxito or Carulla.
- Each batch is caught on its own, so a failed batch is logged and skipped, not fatal. The run's unchecked EAN count goes into an `IngestRun` row with `retailer = <slug>` and a `kind` note in `error` (no schema change).
- *Alternative:* keep only the live lookup per search. Rejected: that's the status quo, and its failures are what users see.
- *Alternative:* cross-fill inside each store's ingest. Rejected: a store's gaps are only known after every store has been read.

**2. Same product by name: re-point the listing, with an audit row.**
- A matched listing's `RetailerProduct.productId` is re-pointed to the product it matches. Search, baskets, plans and history then group it with no new join logic, since they already key by product id or EAN.
- A new table records each match so it can be undone:
  ```
  ProductMatch { id, retailerProductId @unique, fromProductId, toProductId, by ("muse" | "rules"), reason, matchedAt }
  ```
- `recordOffer` doesn't touch `productId` on update, so the next ingest keeps the link.
- The listing's own barcode now belongs to an orphan product (no listings). Any lookup of a product by EAN (`recordOffer` create, receipt matching, `listingsByEan`) first follows `ProductMatch.fromProductId → toProductId`. A receipt line with D1's barcode then lands on the shared product.
- *Alternative:* a link table, with groups computed at query time (union-find). Rejected: every query path (compare, basket, plan, history, receipts) would need it.
- *Alternative:* an EAN alias table instead of re-pointing. Same downside.

**3. Same product is a two-stage judgment: rule pre-filter, then Muse.**

*Stage 1, candidates* (pure, `packages/core/src/match.ts`):
- `candidatesFor(product, listings)` keeps listings where:
  - the size is equal after `parsePackageSize` normalization (g, ml or units, same amount, same multipack count);
  - the brand is equal, ignoring case, accents and corporate suffixes (`S.A.`, `SAS`), when both listings have one;
  - the aisle is the same.
- It keeps at most 8, ordered by shared name words.
- Listings come from that store's stored listings first, then from a live `search("<brand> <name words>")` at that store.

*Stage 2, judgment* (`apps/web/src/server/same-product.ts`):
- `judgeSameProduct(product, candidates)` makes one `museJson` call at `effort: "low"`:
  - **Shown:** the product and the numbered candidates, as name, brand and size. No prices.
  - **Asked:** "which one, if any, is the same product a shopper would get, the same variety and form; store abbreviations and word order don't matter".
  - **Returned:** `{ pick: integer | null, reason: string }`, a one-line reason in Spanish.
- The pick is rejected (no match) when it's out of range, or when the candidate fails `candidatesFor` again; this protects against a model slip.
- Results are cached for 6 h, by product id plus the sorted candidate ids. A "none" verdict is cached as well, so we don't ask again.

*Fallback* (`MuseUnavailable`):
- `sameProduct(a, b)`, the strict rule: brand, size and variety tokens equal. Variety tokens are the name words left after removing the brand, size, `PACKAGING`, filler words and store wording ("x", "und", "tetra pak").
- It matches only when exactly one candidate passes, and the match is saved with `by: "rules"` and no reason.

*Why Muse rather than rules alone.* Store names differ in ways rules can't cover: abbreviations ("Deslact."), store-specific product names ("Leche 2.0"), word order, missing variety words. Rules alone either miss matches or merge varieties. Keeping the size and brand checks as hard filters limits Muse to the judgment rules can't make.

*Alternative:* let Muse search freely across a store's catalog. Rejected: more tokens, harder to check, and it could pick a listing that fails size or brand.

**4. Live all-store check: `POST /api/products/:id/stores`.**
- Request: product id. Response: one entry per enabled store, `{ store, state: "price" | "not-sold" | "unchecked", offer? }`.
- Stores with a current price are returned from the database, with no request. For each other store, in parallel with a 15 s timeout each:
  1. `byEans([ean])`;
  2. if nothing is found, candidates, then `judgeSameProduct`.
- **not-sold** only when both steps returned without error and Muse (or the strict rule) found no match.
- **unchecked** on store timeout, 429 or error, or when Muse is unavailable and the rule can't decide among several candidates.
- A store matched by judgment includes `reason` in its entry.
- Found offers are recorded (`<slug>:live-ean` or `<slug>:name-match`) before the response, and a name match writes `ProductMatch`.
- Interactive requests stay `patient: false`, so they fail fast instead of waiting out a cool-down.

**5. "Similar" in search, "Similares" on the product page, grouped by Muse.**
- **Search:** `compareProducts` detects a brand in the query: a query token, or a pair of tokens, equal to a known brand. Known brands are the distinct `Product.brand` values, normalized and cached for 6 h. When there is one, products of other brands get `similar: true` and sort after the brand's products. The API contract adds `similar?: boolean` and `reason?: string` to `ComparedProduct`.
- **Product page:** `GET /api/products/:id/similar`:
  1. Search the snapshot for the product's name words without the brand and size. Keep listings with another brand, or the same brand in another variety, in the same unit family (g, ml or units), at most 30.
  2. Group them with `valueGroups`, extended so each grouped item can carry a one-line reason ("Leche semidescremada de otra marca"). Keep the items Muse puts in the product's own kind.
  3. Rank by unit price, computed by the app from stored prices and sizes. Return at most 6.
- Without Muse, the existing `ruleGroups` decide, and items have no reason.
- Each result is a normal `ComparedProduct` with its own store prices, `similar: true` and `reason`.
- **Savings** ("Ahorras … frente a") are already computed within one product's offers, so they never mix products.
- *Alternative:* a new Muse prompt just for Similares. Rejected: `valueGroups` already asks exactly "which of these a shopper buys interchangeably". Adding a reason field keeps one prompt and one cache for both the value view and Similares.

**6. Mobile.**
- **`app/product/[id].tsx`:**
  - Under the store prices, a "Buscar en todas las tiendas" button appears when any enabled store lacks a price.
  - While it runs, each store row shows a spinner. Then it shows the price, "No lo vende" or "No pudimos revisar · Reintentar".
  - A store matched by judgment shows Muse's reason in small text under its price.
  - A "Similares" section shows each item's store price, unit price, reason, and an "Otro producto" label.
- **Search cards** with `similar: true` get a "Similar" chip and appear after the products of the brand searched.

## Risks / Trade-offs

- **[Muse wrongly says two products are the same]**
  - Size and brand are hard filters before and after Muse, so a mistake is limited to the variety.
  - Every match stores Muse's reason in `ProductMatch`, so a bad one is visible on the product page and can be undone by script.
  - The opt-in live test runs real near misses (entera vs. deslactosada, "Leche 2.0").
- **[Muse cost and latency]**
  - Calls happen only on demand: product page checks and Similares, never search or the nightly run.
  - Each call has at most 8 candidates, at low effort, and verdicts are cached for 6 h; a saved match never needs Muse again.
  - The product page check runs stores in parallel, so Muse adds roughly one call's time, not one per store.
- **[Muse unavailable]** The strict rule still matches the exact cases, and stores it can't decide stay "No pudimos revisar", never "No lo vende". Similares fall back to the word rules, without reasons.
- **[Nightly run is about 40 minutes longer]** The worker runs at 05:00 and stores are read one after another, so the run should be done before shoppers wake up. Éxito and Carulla live searches may still 429 while it runs, as they do today.
- **[Store names drop the brand]** Some D1 or Jumbo names put the brand only in the `brand` field, or abbreviate it. The rule uses the `brand` field, not the name. Listings with no brand never name-match.
- **[Brand detection misreads a common word as a brand]** For example, a brand called "Campo". Only multi-letter brands that appear in at least 3 listings count, and a term that is also an aisle word is ignored.
- **[The orphan barcode product]** Following `ProductMatch` on EAN lookups is easy to miss. Integration tests cover a receipt line and a later ingest with the orphan barcode.

## Migration Plan

1. Prisma migration: create `ProductMatch`. It's additive.
2. Deploy the worker with cross-fill, and run one ingest plus cross-fill by hand. Compare the coverage counts (products at 1, 2, 3 and 4 stores) before and after.
3. Deploy the API and the app.

Rollback: redeploy the previous images. Re-pointed listings stay grouped. To undo them, run the undo script from the `ProductMatch` rows.

## Open Questions

None blocking. The 8-candidate cap, the 30-item Similares pool and the 15 s timeout are first values, to be tuned against production results.
