# Spec Delta

## Purpose

Turns confirmed receipt lines into in-store price observations that are matched to catalog products, shown alongside online prices with clear labels, and used by the planner only where no online price exists.

## ADDED Requirements

### Requirement: Confirmed lines become labeled observations
Each confirmed, matched receipt line SHALL become a price observation for that store's listing, with source "factura", the store branch, and the receipt's purchase time as its observation time. It SHALL remain distinguishable from online catalog observations in every API response.

#### Scenario: Observation recorded
- **WHEN** a contributor confirms a Jumbo line "LECHE ALQUERIA 1100ML 4.890" matched to the Jumbo listing for that product
- **THEN** a Jumbo observation of 4.890 exists with source "factura", the branch, and the receipt's time

### Requirement: Lines are matched to catalog products
The system SHALL match a line by its printed EAN when present. Otherwise it SHALL propose the best equivalent listing at the same store using the line text, and the user SHALL confirm or change the proposal. A line with no confirmed match SHALL be kept with the receipt but SHALL NOT become a price observation.

#### Scenario: EAN printed
- **WHEN** a D1 line prints EAN 7701101242049
- **THEN** it is matched to D1's listing with that EAN without asking the user

#### Scenario: Abbreviated name
- **WHEN** a line reads "ARZ DIANA 1KG"
- **THEN** the review screen proposes "Arroz Diana 1 kg" at that store, and the user confirms or picks another product

#### Scenario: No match
- **WHEN** the user marks a line "No está en la lista"
- **THEN** the line is stored with the receipt, no price observation is created, and the line earns no points

### Requirement: Produce is compared by canonical item and selling unit
The system SHALL map produce lines to a canonical item (for example "Banano", "Tomate chonto") and record whether the price is per kg or per unit, regardless of each store's internal code. Comparisons SHALL show produce prices of the same canonical item side by side, with a "más barato" verdict only between prices in the same selling unit.

#### Scenario: Same unit across stores
- **WHEN** Jumbo has a factura price for Banano of 3.980 per kg and D1 has one of 3.600 per kg
- **THEN** the Banano comparison shows both per kg and says D1 is 380 per kg cheaper

#### Scenario: Different units
- **WHEN** D1 has Banano at 550 per unit and Jumbo at 3.980 per kg
- **THEN** both are shown with their units, and no cheaper/more expensive verdict is given between them

### Requirement: Community prices are shown with provenance and expire
Wherever a price from a receipt is shown, it SHALL carry the label "Reportado en tienda · factura" with its age, and the branch when known. A receipt price SHALL NOT be shown or used once it is more than 72 hours old. When a store has both an online price and a receipt price for the same product, both SHALL be shown, with the online price first.

#### Scenario: Only a receipt price
- **WHEN** Éxito's only current price for a product comes from a receipt 2 hours old
- **THEN** the Éxito row shows that price labeled "Reportado en tienda · factura · hace 2 h"

#### Scenario: Both prices
- **WHEN** Jumbo's online price is 6.990 and a receipt from 5 hours ago shows 6.490
- **THEN** the Jumbo row shows 6.990 online and, beneath it, "En tienda: 6.490 · factura · hace 5 h"

#### Scenario: Expired
- **WHEN** the only receipt price for a store is 80 hours old
- **THEN** it is not shown and the store is treated as having no price

### Requirement: Planner uses receipt prices only as a fallback
The planner SHALL use a receipt price for an item at a store only when no online observation that the plan would accept exists for that item at that store. A plan line priced from a receipt SHALL say so ("Precio reportado en factura hace 5 h; no verificado en línea"). Receipt prices SHALL NOT be re-checked live, and SHALL count as unverified in the plan's provenance.

#### Scenario: Produce priced from a receipt
- **WHEN** a list has "1 kg banano" and D1 has no online banana price but a receipt price of 3.600 per kg from 6 hours ago
- **THEN** the plan can assign banana to D1 at 3.600, labeled as a receipt price, not verified online

#### Scenario: Online price exists
- **WHEN** Jumbo has an online price and a lower receipt price for the same product
- **THEN** the planner uses the online price
