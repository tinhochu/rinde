# Spec Delta

## Purpose

Defines how Rinde finds one product at every supported store, by barcode and by Muse's judgment of names, brands and sizes. It also covers the live all-store check on a product, and keeping similar products from other brands apart from the same product.

## ADDED Requirements

### Requirement: Nightly barcode cross-fill
After the daily catalog ingest, Rinde SHALL look up every barcode it has an online listing for at each enabled store that has no current listing for that barcode.
- **Pacing:** requests SHALL be batched and paced like the ingest, with the same back-off after a rate-limit answer.
- **Recording:** each price found SHALL be stored as that store's observation, with its request URL and time.
- **Failures:** a store that fails or is rate-limited SHALL NOT stop the other stores. Barcodes left unchecked SHALL be logged with the run.

#### Scenario: Barcode known at one store
- **WHEN** the ingest found barcode 7702001045310 only at Jumbo, and Éxito's catalog lists it at $8.950
- **THEN** after the cross-fill, Éxito's $8.950 is stored with its source URL and time, and searches show the product with both Jumbo's and Éxito's prices without a live lookup

#### Scenario: Store rate-limits the cross-fill
- **WHEN** Carulla answers 429 partway through the cross-fill
- **THEN** the cross-fill waits out the cool-down, continues with the other stores, and the run's log names the barcodes left unchecked

### Requirement: Same product judged by Muse
When a store has no listing with a product's barcode, Rinde MAY match the product to one of that store's listings by judgment.

**Candidates.** A listing SHALL be a candidate only when:
- its package size is the same after converting units (1 L = 1000 ml), with the same count for multipacks;
- its brand is the same as the product's, ignoring case and accents, whenever both have a brand.

**Judgment.** Muse SHALL be given the product and the candidates' names, brands and sizes, and never their prices. It SHALL pick at most one candidate as the same product, with a one-line reason in Spanish. A match SHALL be rejected when the pick is not one of the candidates given.

**When Muse is unavailable.** A match SHALL count only when the brand, size and variety words ("deslactosada", "entera", flavor, scent) are all equal and exactly one candidate meets them.

**After a match.** A confirmed match SHALL be remembered with its reason and who decided it (Muse or the rule), so the two listings show as one product in later searches, baskets and plans. The reason SHALL be shown on the product page next to that store's price.

**Prices.** The price shown SHALL be the matched listing's own stored price, never a value produced by Muse or the matcher.

#### Scenario: Different barcode, same product
- **WHEN** Jumbo lists "Leche deslactosada Alpina x1L" with one barcode, D1 lists "Leche Deslact. ALPINA 1000 ml" with another, and Muse picks it
- **THEN** the two are matched, the product shows both stores' prices, and D1's row shows Muse's reason, e.g. "Misma leche Alpina deslactosada de 1 L; D1 la abrevia"

#### Scenario: A store's own name for a different variety
- **WHEN** the product is "Leche deslactosada Alpina 1 L" and the store's only 1 L candidate is "Leche 2.0" semidescremada
- **THEN** Muse picks none, with a reason, and there is no same-product match at that store

#### Scenario: Size differs
- **WHEN** the store only lists the same milk in 900 ml
- **THEN** it isn't a candidate, and it can only appear under Similares

#### Scenario: Muse unavailable
- **WHEN** Muse doesn't answer, and two listings at the store meet the strict rule
- **THEN** neither is matched as the same product

### Requirement: Check every store from the product page
The product page SHALL offer an action, "Buscar en todas las tiendas", that checks live every enabled store without a current price for the product: by barcode first, then by the same-product judgment above. Each store SHALL end in exactly one state:
- **Price:** the store's price, with its time and a link to the store's listing.
- **"No lo vende":** only when the store answered both lookups and neither found the product.
- **"No pudimos revisar":** when the store didn't answer, timed out, or was rate-limited. A retry action SHALL be offered.

Prices found SHALL be recorded as observations before they are shown. Stores that already had a current price SHALL keep it without a new request.

#### Scenario: Gaps filled live
- **WHEN** a product shows only Jumbo's price and the user taps "Buscar en todas las tiendas", Éxito finds it by barcode, D1 by Muse's judgment, and Carulla answers with nothing
- **THEN** the page shows prices for Jumbo, Éxito and D1 (D1 with Muse's reason), and "No lo vende" for Carulla

#### Scenario: Store doesn't answer
- **WHEN** Carulla is rate-limited during the check
- **THEN** Carulla shows "No pudimos revisar" with a retry, never "No lo vende" and never a price

### Requirement: Similares are grouped by Muse and labeled apart
A listing from another brand, of another variety or of another size SHALL never be shown as the same product.

**Product page.** A "Similares" section SHALL list products that Muse groups as the same kind of item as the product, even when a store names them differently. Each SHALL show:
- its store, its price and its unit price;
- Muse's one-line reason;
- a mark saying it is another product.

They SHALL be ordered by unit price. Muse sees names, brands and sizes, never prices. Without Muse, the existing word rules group them, and no reason is shown.

**Search.** When a query names a brand and a store has no listing of that brand, that store's other-brand results SHALL be labeled "Similar", not shown as results for the brand searched.

**Savings.** "Ahorras" comparisons, and a plan's choice between stores, SHALL compare only the same product, unless the user allowed substitutes for that item.

#### Scenario: Brand searched, store doesn't carry it
- **WHEN** the user searches "leche alpina" and D1 has no Alpina milk
- **THEN** D1's Latti milk appears labeled "Similar" with its unit price, and doesn't count as D1's price for any Alpina product

#### Scenario: Named differently, same kind
- **WHEN** the user opens "Leche semidescremada Alpina 1 L" and another store sells "Leche 2.0 1100 ml"
- **THEN** "Similares" lists "Leche 2.0" with its store price, its unit price per liter and Muse's reason (e.g. "Leche semidescremada de otra marca"), marked as another product

#### Scenario: Similares on a product page
- **WHEN** the user opens "Arroz Diana 1 kg"
- **THEN** "Similares" lists other brands' white rice in any size, ordered by unit price, each marked as another product
