## MODIFIED Requirements

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

## ADDED Requirements

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
