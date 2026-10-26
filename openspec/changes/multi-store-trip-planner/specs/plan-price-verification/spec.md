# Spec Delta

## Purpose

Guarantees that every price shown in a shopping plan is traceable to a real observation of a retailer's public site, carrying its source and time. Chosen items are re-checked live before the plan is shown.

## ADDED Requirements

### Requirement: Every planned price carries provenance
The system SHALL attach to every priced line in a plan the supermarket, the product's page URL, the observation timestamp, and whether the price was verified live during this request or came from a stored snapshot.

#### Scenario: Provenance shown
- **WHEN** a plan line is displayed
- **THEN** the user can see the store, a link to the product page and a label like "verificado hace 2 min" or "precio de hoy 05:00"

### Requirement: Chosen items are re-checked live before presenting
Before returning a plan, the system SHALL re-fetch the current price and availability of every chosen listing from the retailer. If a live price differs from the snapshot price, or an item turns out unavailable, the system SHALL re-optimize with the updated observations.

#### Scenario: Price changed since snapshot
- **WHEN** a chosen item's snapshot price is 4.890 and the live check returns 5.290
- **THEN** the stored observations gain the new price, the plan is recalculated, and the line shows 5.290 as verified

#### Scenario: Item went out of stock
- **WHEN** the live check reports a chosen item unavailable
- **THEN** the plan is recalculated without that listing, and the next-best candidate is used, or the item moves to unavailable

### Requirement: Fallback when a live check fails
If the live check for a listing fails (network error, timeout, retailer error), the system SHALL use the most recent stored observation if it is 36 hours old or less, and label it with its age. Otherwise the system SHALL treat the listing as unavailable for this plan.

#### Scenario: Retailer unreachable, fresh snapshot
- **WHEN** Jumbo does not respond and the stored observation is 6 hours old
- **THEN** the line uses the stored price, labeled "precio de hace 6 h, no verificado"

#### Scenario: Retailer unreachable, stale snapshot
- **WHEN** Jumbo does not respond and the stored observation is 40 hours old
- **THEN** that listing is not used, and the plan uses another candidate or marks the item unavailable with the reason "precio desactualizado"

### Requirement: Live checks are polite and bounded
The system SHALL re-check only the listings chosen for the plan, not every candidate. Requests to any one retailer SHALL be paced, and the whole verification step SHALL finish within a time budget (default 20 seconds). Listings not checked within that budget SHALL follow the fallback rule.

#### Scenario: Time budget exceeded
- **WHEN** verification of 25 items exceeds 20 seconds
- **THEN** the remaining items use the fallback rule, and the plan is returned without waiting longer

### Requirement: Verification progress is visible
The system SHALL report verification progress per store while it runs (items checked, items confirmed, items changed), so the interface can show the agent working.

#### Scenario: Progress stream
- **WHEN** a plan is being verified
- **THEN** the client receives updates like "Verificando D1… 9/9 ✓" and "Verificando Jumbo… 5/6, 1 cambio de precio"
