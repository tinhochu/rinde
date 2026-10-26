# Spec Delta

## Purpose

When the cheapest feasible plan exceeds the user's budget, proposes concrete trade-offs with exact peso effects. The user accepts or rejects each one, and the plan recalculates until it fits or the user stops.

## ADDED Requirements

### Requirement: Trade-offs are proposed when over budget
When the recommended plan's total exceeds the budget, the system SHALL return a ranked list of trade-off proposals. Each proposal SHALL show the exact saving in COP computed from observed prices. Proposal types are:
- swap to an equivalent cheaper product (for example, a store brand)
- choose a different pack size that still covers the quantity
- reduce the quantity of a non-essential item
- drop a non-essential item

#### Scenario: Over budget
- **WHEN** the budget is 150.000 and the best plan totals 171.350
- **THEN** the response marks the plan over budget by 21.350 and includes trade-off proposals, each with its saving

#### Scenario: Within budget
- **WHEN** the plan total is within the budget
- **THEN** no trade-offs are proposed

### Requirement: Trade-offs respect user preferences
The system SHALL NOT propose dropping or reducing an essential item. It SHALL NOT propose a product swap for an item that disallows substitution.

#### Scenario: Essential item protected
- **WHEN** rice is marked essential and the plan is over budget
- **THEN** no proposal drops or reduces the rice

### Requirement: Proposals are ranked by saving per sacrifice
The system SHALL order proposals so that swaps and pack changes, which keep the item, come before quantity reductions and drops. Within each group, larger savings come first.

#### Scenario: Ranking
- **WHEN** a store-brand swap saves 3.000 and dropping cookies saves 6.000
- **THEN** the swap is listed before the drop

### Requirement: Accepting or rejecting a trade-off recalculates the plan
When the user accepts a proposal, the system SHALL apply it to the list, re-optimize (including store selection), and return the new plan, remaining budget and refreshed proposals. A rejected proposal SHALL NOT be offered again for the same list.

#### Scenario: Accept until within budget
- **WHEN** the user accepts proposals until the total is at or below the budget
- **THEN** the plan is marked within budget and no further proposals are returned

#### Scenario: Reject
- **WHEN** the user rejects the "drop cookies" proposal
- **THEN** later proposal lists for that list no longer include dropping cookies

### Requirement: Proposal wording may be generated, numbers may not
Proposals MAY include a short natural-language explanation written by a language model. Every amount in a proposal SHALL come from the deterministic plan calculation. If the explanation text contains numbers, they SHALL match the computed values or be replaced with them.

#### Scenario: Explanation consistency
- **WHEN** a proposal saves 3.200
- **THEN** any amount shown in its explanation is 3.200
