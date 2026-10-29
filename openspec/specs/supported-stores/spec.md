# supported-stores Specification

## Purpose
Defines which grocery stores Rinde compares (D1, Jumbo, Éxito and Carulla) and where each one appears: catalog, search and comparisons, the trip planner, receipt and e-invoice intake, and the words the app and landing page use.

## Requirements

### Requirement: Four compared stores
Rinde SHALL compare four stores: D1, Jumbo, Éxito and Carulla. Each store is a separate store everywhere, with its own prices, even when two stores sell the same product under the same code. Wherever stores are listed in a fixed order (badges, plan stops, totals, copy), Carulla SHALL come after the other three, and the existing order of the other three SHALL stay as it is. Carulla's name SHALL be written "Carulla".

#### Scenario: Same product, two prices
- **WHEN** a product with barcode 7702001025015 is priced $35.450 at Éxito and $37.300 at Carulla
- **THEN** the comparison shows both stores with their own price, and Éxito as the cheaper one

#### Scenario: Same price at both
- **WHEN** a product has the same price at Éxito and Carulla
- **THEN** both stores are shown with that price; neither hides the other

### Requirement: Carulla in search, comparisons and planning
Search results, product comparisons, basket totals and trip plans SHALL include Carulla offers on the same terms as the other stores: only real prices that are fresh enough (the same online age limit as the other stores), each with its source and the time it was seen. The trip planner SHALL consider every combination of enabled stores, including plans with Carulla alone or Carulla with others. Stores the user picked in their shopping preferences SHALL allow up to four stores.

#### Scenario: Planner picks Carulla
- **WHEN** a list's items are cheapest overall at Carulla, after the trip cost of extra stops
- **THEN** the recommended plan sends the user to Carulla and labels its lines with Carulla's prices and their age

#### Scenario: No Carulla price
- **WHEN** Carulla has no fresh online price for an item
- **THEN** the item is never priced at Carulla, and the plan says it isn't available there, as for other stores

### Requirement: Carulla is always on
Carulla SHALL always be ingested and offered to users, like D1 and Jumbo. No setting SHALL turn it off.

#### Scenario: Fresh deployment
- **WHEN** Rinde is deployed or run locally with no store settings
- **THEN** Carulla is ingested and its prices appear in search, comparisons, totals and plans

### Requirement: Carulla receipts and e-invoices
A receipt photo or DIAN e-invoice from a Carulla store SHALL be accepted as a Carulla purchase. Carulla invoices are issued by Almacenes Éxito S.A. (NIT 890900608), the same company as Éxito's. The banner or store name on the document SHALL therefore decide between Éxito and Carulla. A document naming Carulla SHALL be Carulla, even when the legal name says Éxito. A document from another chain run by the same company (Surtimax, Super Inter, Surtimayorista) SHALL still be rejected, as SHALL any other chain. Every existing receipt rule applies to Carulla unchanged:
- the user reviews each line before submitting;
- the arithmetic checks;
- the receipt-date window;
- duplicate detection;
- a receipt or e-invoice can belong to only one account;
- the rewards rules, including the gap bonus for a first Carulla price.

#### Scenario: Carulla e-invoice
- **WHEN** a user uploads a DIAN e-invoice with supplier NIT 890900608 and banner "CARULLA EXPRESS EDS EL RETIRO"
- **THEN** it is read as a Carulla purchase at that branch

#### Scenario: Carulla receipt photo
- **WHEN** a receipt photo reads "CARULLA" and "ALMACENES EXITO S.A."
- **THEN** the store is Carulla, not Éxito

#### Scenario: Sister chain still rejected
- **WHEN** an e-invoice with NIT 890900608 has banner "SURTIMAX CALDAS"
- **THEN** it is rejected with the message that lists the accepted stores

#### Scenario: Same invoice, second account
- **WHEN** a Carulla e-invoice already confirmed by one account is uploaded by another account
- **THEN** it is rejected as already submitted, as for any other store

### Requirement: Words that name the stores
Every place in the app, the API's user-facing messages and reply emails, and the landing page that lists the compared stores SHALL list all four, with Carulla last (for example "D1, Jumbo, Éxito y Carulla" in Spanish and "D1, Jumbo, Éxito and Carulla" in English). This includes the store strip, the meta descriptions and the "not affiliated" disclaimer. Carulla SHALL have a store badge in the app, readable in light and dark mode.

#### Scenario: Unsupported-store message
- **WHEN** a receipt from an unsupported chain is rejected
- **THEN** the message says Rinde reads receipts from D1, Jumbo, Éxito and Carulla

#### Scenario: Landing disclaimer
- **WHEN** a visitor reads the landing page footer in either language
- **THEN** it says Rinde is not affiliated with D1, Jumbo, Éxito or Carulla
