# trip-planning Specification

## Purpose
Turns a confirmed shopping list and a COP budget into a concrete purchase plan. The plan says exactly what to buy at which supermarket, splitting across stores only when the extra trip pays off.

## Requirements

### Requirement: Plan assigns every coverable item to a store
Given a confirmed shopping list, a budget in whole COP, the set of enabled supermarkets and candidate products per list item, the system SHALL return a plan. In the plan, every coverable list item is assigned to exactly one supermarket and exactly one product listing, with a number of packs.

#### Scenario: Two-store plan
- **WHEN** a list has 10 items and both D1 and Jumbo have candidates for all of them
- **THEN** the plan lists every item under exactly one of D1 or Jumbo, with the chosen product, pack count, unit price and line total

#### Scenario: Item with no candidates
- **WHEN** a list item has no available candidate at any enabled supermarket
- **THEN** the item appears in the plan's unavailable section with the reason "no disponible en ninguna tienda", and it is not priced

### Requirement: Extra stops only when they pay off
The system SHALL evaluate every combination of enabled supermarkets. Each stop beyond the first SHALL cost a configurable amount (default 10.000 COP). The recommended plan SHALL be the one with the lowest goods total plus extra-stop cost. Goods totals alone SHALL NOT decide the recommendation.

#### Scenario: Second store saves more than the trip cost
- **WHEN** buying everything at D1 costs 182.000, and splitting between D1 and Jumbo costs 165.000, with a trip cost of 10.000
- **THEN** the recommended plan has 2 stops and shows a saving of 17.000 compared with the 1-stop plan

#### Scenario: Second store saves less than the trip cost
- **WHEN** splitting between D1 and Jumbo saves 4.000 compared with D1 alone, with a trip cost of 10.000
- **THEN** the recommended plan has 1 stop (D1), and the 2-stop alternative is still shown with its 4.000 saving

#### Scenario: User changes the trip cost
- **WHEN** the user sets the trip cost to 0
- **THEN** the recommended plan is the one with the lowest goods total, whatever its stop count

### Requirement: Alternatives by stop count
The system SHALL return, alongside the recommended plan, the best plan for each possible number of stops. Each alternative SHALL show its goods total, number of stops and difference from the recommended plan.

#### Scenario: Alternatives shown
- **WHEN** D1 and Jumbo are enabled
- **THEN** the response contains the best 1-stop plan (naming its store) and the best 2-stop plan, each with total and stop count

### Requirement: Quantities are covered by whole packs
For each item, the system SHALL choose a pack count of whole packs that meets or exceeds the requested quantity. It SHALL compare candidates by the line total for that pack count, not by package price alone.

#### Scenario: Different pack sizes
- **WHEN** the user asks for 1 kg of lentils, store A sells 454 g at 2.710 and store B sells 500 g at 2.550
- **THEN** store A needs 3 packs (8.130), store B needs 2 packs (5.100), and store B is chosen

#### Scenario: Count-based items
- **WHEN** the user asks for 30 eggs and a candidate is a 15-egg tray
- **THEN** the line uses 2 trays

### Requirement: Essential and substitution preferences are respected
The system SHALL use only candidates the item allows. When substitution is not allowed, only candidates that match the requested product (same EAN, or same brand and type) SHALL be used. Essential items SHALL never be dropped automatically.

#### Scenario: Substitution disallowed
- **WHEN** an item "Arroz Diana 1 kg" has substitution disabled and a cheaper store-brand rice exists
- **THEN** the plan uses Arroz Diana, and the store-brand rice is not chosen

#### Scenario: Substitution allowed
- **WHEN** substitution is allowed and an equivalent store-brand product is cheaper
- **THEN** the plan chooses it, marks the line as a substitution and explains it with the original product and the price difference

### Requirement: Each line explains its store choice
For each planned item, the system SHALL include a short reason based on observed prices. The reason SHALL compare the line with the best alternative at another enabled store, or state that no other store carries it.

#### Scenario: Cheaper elsewhere comparison
- **WHEN** an item is assigned to D1 at 3.990 and the best Jumbo option for the same need is 5.100
- **THEN** the reason reads like "1.110 más barato que en Jumbo"

### Requirement: Savings are measured against a stated baseline
The system SHALL compute savings as the baseline total minus the recommended plan total. The baseline is the cheapest single store buying the closest literal match for each item, with no substitutions. The response SHALL include a plain-language description of the baseline. Items unavailable in the baseline SHALL be excluded from both sides of the comparison.

#### Scenario: Savings with description
- **WHEN** a plan is produced
- **THEN** the response includes `baselineTotal`, `savings`, and a description like "Comparado con comprar todo en Jumbo, sin cambios de marca"

### Requirement: Plan output is grouped by store
The system SHALL group planned items by supermarket. It SHALL show, for each store, a pick list, a subtotal and a line count, plus an overall total and the budget remaining (budget minus total, may be negative).

#### Scenario: Within budget
- **WHEN** the budget is 200.000 and the plan total is 171.350
- **THEN** the response shows a remaining budget of 28.650 and per-store subtotals that add up to 171.350

### Requirement: Plans are deterministic and never priced by a model
Given the same inputs and price observations, the system SHALL produce the same plan. Every price, total and saving SHALL be computed from stored or freshly fetched price observations. None of them SHALL come from model-generated text.

#### Scenario: Repeatable result
- **WHEN** the same list, budget, trip cost and observations are optimized twice
- **THEN** both plans are identical
