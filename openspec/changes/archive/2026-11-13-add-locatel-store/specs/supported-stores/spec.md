## RENAMED Requirements

- FROM: `### Requirement: Four compared stores`
- TO: `### Requirement: Compared stores`

## MODIFIED Requirements

### Requirement: Compared stores
Rinde SHALL compare five stores: D1, Jumbo, Éxito, Carulla and Locatel. Each store is a separate store everywhere, with its own prices, even when two stores sell the same product under the same code. Wherever stores are listed in a fixed order (badges, plan stops, totals, copy), the order SHALL be D1, Jumbo, Éxito, Carulla, Locatel, with Locatel last. Locatel's name SHALL be written "Locatel".

#### Scenario: Same product, two prices
- **WHEN** a product with barcode 7702001025015 is priced $35.450 at Éxito and $37.300 at Carulla
- **THEN** the comparison shows both stores with their own price, and Éxito as the cheaper one

#### Scenario: Same price at both
- **WHEN** a product has the same price at Éxito and Carulla
- **THEN** both stores are shown with that price; neither hides the other

#### Scenario: Locatel in a comparison
- **WHEN** a product with barcode 7702001044481 is priced at Locatel and at Jumbo
- **THEN** the comparison shows Locatel with its own price beside Jumbo's

### Requirement: Words that name the stores
Every place in the app, the API's user-facing messages and the landing page that lists the compared stores SHALL list all five, with Locatel last (for example "D1, Jumbo, Éxito, Carulla y Locatel" in Spanish and "D1, Jumbo, Éxito, Carulla and Locatel" in English). This includes the store strip, the meta descriptions and the "not affiliated" disclaimer. Places that list the stores whose receipts Rinde reads SHALL keep listing only D1, Jumbo, Éxito and Carulla. Every store SHALL have a store badge in the app, readable in light and dark mode.

#### Scenario: Unsupported-store message
- **WHEN** a receipt from an unsupported chain is rejected
- **THEN** the message says Rinde reads receipts from D1, Jumbo, Éxito and Carulla

#### Scenario: Landing disclaimer
- **WHEN** a visitor reads the landing page footer in either language
- **THEN** it says Rinde is not affiliated with D1, Jumbo, Éxito, Carulla or Locatel

## ADDED Requirements

### Requirement: Locatel in search, comparisons and planning
Search results, product comparisons, basket totals and trip plans SHALL include Locatel offers on the same terms as the other stores: only real prices that are fresh enough, each with its source and the time it was seen. Locatel SHALL always be ingested and offered, like D1, Jumbo and Carulla. Stores the user picked in their shopping preferences SHALL allow up to five stores.

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
