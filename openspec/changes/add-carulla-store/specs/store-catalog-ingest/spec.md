# Spec Delta

## Purpose

Defines how Rinde reads a store's online prices: which public endpoint, how often, and the rule that a price belongs to the store only when the store itself sells the product.

## ADDED Requirements

### Requirement: Carulla catalog source
Carulla's online prices SHALL be read from Carulla's public VTEX catalog search at `https://www.carulla.com/io/api/catalog_system/pub/products/search`. That is the path its `/api/` redirects to, as for Éxito. Requests SHALL be paced at least 5 seconds apart, with the same back-off after a rate-limit answer used for the other stores. Every stored price SHALL keep the request URL as its source and the time it was read. The daily ingest SHALL cover the same staple terms as the other stores.

#### Scenario: Daily ingest
- **WHEN** the scheduled ingest runs
- **THEN** Carulla is read after the other stores, no two Carulla requests are under 5 seconds apart, and each saved price records its source URL and time

#### Scenario: Rate limited
- **WHEN** Carulla answers 429
- **THEN** ingest waits out the cool-down instead of retrying at once, and interactive lookups fail fast without a Carulla price

### Requirement: Price from the store's own seller
For Éxito and Carulla, whose sites also list third-party marketplace sellers, an offer's price, list price and stock SHALL come from the store's own seller. If the store's own seller does not sell the product (no price or not available), the product SHALL count as not available at that store, even when a marketplace seller has it. A marketplace seller's price SHALL never be shown as the store's price.

#### Scenario: Only a marketplace seller has it
- **WHEN** a Carulla product's own seller is unavailable and a marketplace seller lists it at $30.500
- **THEN** Rinde shows no Carulla price for it

#### Scenario: Both sell it
- **WHEN** an Éxito product is sold by Éxito at $8.950 and by a marketplace seller at $7.900
- **THEN** Rinde's Éxito price is $8.950
