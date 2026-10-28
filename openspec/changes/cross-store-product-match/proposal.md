# Proposal

## Why

Rinde's promise is "the same product, every store's price". In production most products show one store:
- Of 4,557 products with a barcode (2026-10-28), 3,295 are known at only one store, and only 11 are known at all four.
- For "leche alpina", 11 of 18 results show only D1's price, and none show Carulla's.

The barcode lookup that fills the gaps runs live during each search. Éxito and Carulla often rate-limit it (429), and then the answer is "puede tenerlos".

Barcodes also aren't enough. The same product can carry another barcode at another store, and each store names products its own way ("Leche Deslact. Alpina 1000ml", "Leche 2.0").

Shoppers also can't tell the same product from a substitute. A search for "leche alpina" lists D1's own Latti milk with no label, because D1 doesn't sell Alpina.

## What Changes

- **Nightly barcode cross-fill.** After the daily ingest, every barcode seen at any store is looked up at every other store, in batches. Search then finds cross-store prices already stored, instead of asking stores live under rate limits.
- **Same product, judged by Muse.** When a store doesn't carry a product's barcode:
  1. Simple checks narrow that store's listings to candidates: the same size in the same unit, the same brand when both have one, and the same aisle.
  2. Meta Muse reasons over the candidates' names, brands and sizes, never their prices. It picks the one that is the same product, or says none is, with a one-line reason in Spanish.
  3. A match is saved with its reason, so the product groups across stores from then on.

  When Muse is unavailable, only exact matches count: brand, size and variety words all equal.
- **"Buscar en todas las tiendas" on the product page.** It re-checks every store still missing, live: by barcode, then with the Muse judge. Each store ends in one of three states:
  - a price;
  - "No lo vende" (the store answered and doesn't have it);
  - "No pudimos revisar" (the store didn't answer), with a retry.
- **"Similares", grouped by Muse.** The product page gets a "Similares" section: the same kind of item even when another store names it differently (a store's "Leche 2.0" next to "leche semidescremada"). Each is compared by unit price, shows Muse's one-line reason, and is marked as a different product. In search, when a query names a brand a store doesn't carry, that store's other-brand results are labeled "Similar".
- **Price rules unchanged.** Every price still comes from a stored store observation with its source and time. Muse decides only *which* listing is the same or a similar product. It never sees, produces or adjusts a price.

## Capabilities

### New Capabilities
- `cross-store-matching`: finding one product at every store. Covers:
  - the nightly barcode cross-fill;
  - same-product matching judged by Muse, with a strict rule when Muse is unavailable;
  - the product page's all-store check and its per-store states;
  - "Similares", grouped by Muse and labeled apart from the same product.

### Modified Capabilities
- None. The archived specs don't define product grouping yet, and `store-catalog-ingest` (in `add-carulla-store`) is about reading a store's catalog, which doesn't change.

## Impact

- **Data:** a new table of confirmed same-product matches between products with different barcodes, with Muse's reason and who decided (`muse` or `rules`), plus a migration. Observations keep their existing shape. Cross-fill prices are recorded with source `<store>:cross-ean`, and name matches with `<store>:name-match`.
- **Worker:** a cross-fill step after `ingestAll()`, paced like the ingest. It adds about 12 minutes each for Éxito and Carulla.
- **API** (`apps/web`):
  - a Muse same-product judge, using the existing `museJson` adapter;
  - `compare.ts` and `basket.ts` group matched products together;
  - search results mark other-brand listings as similar;
  - a new endpoint checks one product across all stores live and returns a state per store;
  - a Similares endpoint, using the Muse kind grouping (`valueGroups`) with reasons.
- **Muse usage:**
  - one low-effort call per product and store checked on demand, cached;
  - one call per Similares list, cached;
  - no Muse calls in the nightly run.
- **Mobile:** the product page gets the "Buscar en todas las tiendas" action, the per-store states, the match reason and the "Similares" section. Search results get a "Similar" label.
- **Stores:** the nightly run makes more requests to the VTEX catalog APIs we already use, with the same pacing and the same 429 back-off.
