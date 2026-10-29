# budget-tradeoffs Specification

## Purpose
When the cheapest feasible plan exceeds the user's budget, proposes concrete trade-offs with exact peso effects. The user accepts or rejects each one, and the plan recalculates until it fits or the user stops.

## Requirements

### Requirement: Trade-offs are proposed when over budget
When the recommended plan's total exceeds the budget, the system SHALL return a ranked list of trade-off proposals. Each proposal SHALL show its exact saving in COP, computed from observed prices by re-planning with the change applied. Proposals with no saving SHALL NOT be shown. Proposal types are:
- **add a stop:** visit another supermarket when that lowers the goods total (the recommended plan may have avoided it to save a trip)
- **allow another brand:** for an item where the user disallowed substitution, ask permission to use a cheaper equivalent
- **smaller amount:** buy less of a non-essential item (one pack fewer, or a smaller presentation below the requested quantity)
- **drop:** remove a non-essential item

#### Scenario: Over budget
- **WHEN** the budget is 150.000 and the best plan totals 171.350
- **THEN** the response marks the plan over budget by 21.350 and includes trade-off proposals, each with its saving

#### Scenario: Within budget
- **WHEN** the plan total is within the budget
- **THEN** no trade-offs are proposed

#### Scenario: Add a stop
- **WHEN** the recommended plan uses only D1 to avoid a trip, and also buying at Jumbo would lower the goods total by 6.000
- **THEN** a proposal "Ir también a Jumbo" with a saving of 6.000 is offered

### Requirement: Trade-offs respect user preferences
The system SHALL NOT propose reducing or dropping an essential item. "Allow another brand" SHALL only be proposed as an explicit question to the user, and it applies only to the item named in the proposal.

#### Scenario: Essential item protected
- **WHEN** rice is marked essential and the plan is over budget
- **THEN** no proposal reduces or drops the rice

### Requirement: Proposals are ranked by saving per sacrifice
The system SHALL order proposals so that those keeping every item at its full quantity (add a stop, allow another brand) come before smaller amounts, and smaller amounts come before drops. Within each group, larger savings come first. At most 5 proposals SHALL be returned.

#### Scenario: Ranking
- **WHEN** allowing another brand saves 3.000 and dropping cookies saves 6.000
- **THEN** allowing another brand is listed before the drop

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
