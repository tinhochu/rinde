# supported-stores Specification

## Purpose
Defines which grocery stores Rinde compares (D1, Jumbo, Éxito, Carulla, Euro and Locatel) and where each one appears: catalog, search and comparisons, the trip planner, receipt and e-invoice intake, and the words the app and landing page use.

## Requirements

### Requirement: Compared stores
Rinde SHALL compare six stores: D1, Jumbo, Éxito, Carulla, Euro and Locatel. Each store is a separate store everywhere, with its own prices, even when two stores sell the same product under the same code. Wherever stores are listed in a fixed order (badges, plan stops, totals, copy), the order SHALL be D1, Jumbo, Éxito, Carulla, Euro, Locatel, with Locatel last. Euro's name SHALL be written "Euro" and Locatel's "Locatel".

#### Scenario: Same product, two prices
- **WHEN** a product with barcode 7702001025015 is priced $35.450 at Éxito and $37.300 at Carulla
- **THEN** the comparison shows both stores with their own price, and Éxito as the cheaper one

#### Scenario: Same price at both
- **WHEN** a product has the same price at Éxito and Carulla
- **THEN** both stores are shown with that price; neither hides the other

#### Scenario: Locatel in a comparison
- **WHEN** a product with barcode 7702001044481 is priced at Locatel and at Jumbo
- **THEN** the comparison shows Locatel with its own price beside Jumbo's

#### Scenario: Euro in a comparison
- **WHEN** a product is priced at Euro and at Carulla
- **THEN** the comparison shows Euro with its own price beside Carulla's, and Euro before Locatel

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
Every place in the app, the API's user-facing messages and the landing page that lists the compared stores SHALL list all six, with Euro after Carulla and Locatel last (for example "D1, Jumbo, Éxito, Carulla, Euro y Locatel" in Spanish and "D1, Jumbo, Éxito, Carulla, Euro and Locatel" in English). This includes the store strip, the meta descriptions and the "not affiliated" disclaimer. Places that list the stores whose receipts Rinde reads SHALL keep listing only D1, Jumbo, Éxito and Carulla. Every store SHALL have a store badge in the app, readable in light and dark mode.

#### Scenario: Unsupported-store message
- **WHEN** a receipt from an unsupported chain is rejected
- **THEN** the message says Rinde reads receipts from D1, Jumbo, Éxito and Carulla

#### Scenario: Landing disclaimer
- **WHEN** a visitor reads the landing page footer in either language
- **THEN** it says Rinde is not affiliated with D1, Jumbo, Éxito, Carulla, Euro or Locatel

### Requirement: Locatel in search, comparisons and planning
Search results, product comparisons, basket totals and trip plans SHALL include Locatel offers on the same terms as the other stores: only real prices that are fresh enough, each with its source and the time it was seen. Locatel SHALL always be ingested and offered, like D1, Jumbo and Carulla. Stores the user picked in their shopping preferences SHALL allow up to six stores.

#### Scenario: Saved preferences with Locatel
- **WHEN** a user picks Locatel among their stores and reopens the app
- **THEN** the saved plan draft loads with Locatel still picked

### Requirement: Locatel in route plans
A route plan SHALL accept Locatel as the store the trip goes to, by the person's location or a typed address. Locatel branches SHALL be imported from OpenStreetMap features tagged `brand=Locatel` as a pharmacy (`amenity=pharmacy`) or a `shop` of `chemist`, `health_food` or `medical_supply`. Where no Locatel branch is mapped near the anchor, Locatel SHALL NOT be offered as a second stop.

#### Scenario: No mapped branches
- **WHEN** a route plan is anchored at a D1 and no Locatel branch is mapped nearby
- **THEN** no "D1 + Locatel" option is offered

### Requirement: No Locatel receipts yet
Receipt photos and e-invoices from Locatel SHALL be rejected with the message that lists the accepted stores, like any other unsupported chain.

#### Scenario: Locatel e-invoice
- **WHEN** a user uploads a Locatel e-invoice
- **THEN** it is rejected with the message that Rinde reads receipts from D1, Jumbo, Éxito and Carulla

### Requirement: Euro in search, comparisons and planning
Search results, product comparisons, basket totals and trip plans SHALL include Euro offers on the same terms as the other stores: only real prices that are fresh enough, each with its source and the time it was seen. Euro SHALL always be ingested and offered, like D1, Jumbo, Carulla and Locatel.

#### Scenario: Saved preferences with all six stores
- **WHEN** a user picks all six stores, Euro among them, and reopens the app
- **THEN** the saved plan draft loads with all six still picked

### Requirement: Euro in route plans
A route plan SHALL accept Euro as the store the trip goes to and offer it as a second stop where a branch is mapped nearby. Euro branches SHALL be imported from OpenStreetMap supermarkets tagged `brand=Euro` or `brand=Euro Supermercados`, and from supermarkets with no `brand` tag whose name is exactly "Euro", "Euro Supermercados" or "Euro Supermercado" (any case). Other shops named Euro, and supermarkets whose name only starts with "Euro", SHALL NOT count.

#### Scenario: Unbranded Euro supermarket
- **WHEN** OSM has a `shop=supermarket` named "Euro" with no brand tag in Medellín
- **THEN** it is imported as a Euro branch

#### Scenario: Lookalike name
- **WHEN** OSM has a supermarket named "Euromarket"
- **THEN** it is not imported as a Euro branch

### Requirement: No Euro receipts yet
Receipt photos and e-invoices from Euro SHALL be rejected with the message that lists the accepted stores, like any other unsupported chain.

#### Scenario: Euro e-invoice
- **WHEN** a user uploads a Euro e-invoice
- **THEN** it is rejected with the message that Rinde reads receipts from D1, Jumbo, Éxito and Carulla
