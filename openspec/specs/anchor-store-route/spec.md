# anchor-store-route Specification

## Purpose
Defines how Rinde plans a shopping trip around the supermarket a person is already going to. It covers which other store near it is worth a stop for this person, with Muse's reasoning, and the order of the stops and items.

## Requirements

### Requirement: Choose the store you're going to
Before a route plan, the app SHALL ask "¿A qué súper vas?". The person SHALL be able to choose the chain and branch either way:
- from a list of known branches, searchable by name or neighborhood;
- with "Usar mi ubicación", which sorts branches by distance and preselects the nearest.

Location permission SHALL be optional; the list works without it. When the branch isn't listed, the person SHALL be able to use their current location or a typed address as the anchor point.

#### Scenario: Without location permission
- **WHEN** the person denies location and searches "D1 Chapinero"
- **THEN** matching D1 branches are listed, and choosing one sets it as the anchor

#### Scenario: With location
- **WHEN** the person taps "Usar mi ubicación"
- **THEN** branches are sorted by route time for the chosen travel mode, the closest one of the chosen chain is preselected, and each shows its route distance and minutes

### Requirement: Branch data with its source
Branches SHALL come from OpenStreetMap, with chain, name, address when mapped, and coordinates. Any screen showing branches SHALL show "© OpenStreetMap contributors". The list SHALL be refreshed at least monthly, and it SHALL keep the time of the last refresh.

#### Scenario: Attribution
- **WHEN** the branch picker or the route map is shown
- **THEN** "© OpenStreetMap contributors" is visible

### Requirement: Travel mode and its cost
The person SHALL choose how they travel: a pie, bus/TransMilenio, moto or carro. Each mode SHALL have defaults the person can edit and the app remembers:
- walking speed;
- bus fare per ride;
- cost per km for moto and car;
- parking per stop for car.

The person MAY add a short note about their situation ("voy cargado", "tengo 30 minutos").

#### Scenario: Edit the bus fare
- **WHEN** the person changes the bus fare to $3.200
- **THEN** later plans use $3.200 per extra ride, until they change it again

### Requirement: Distances and times come from a street route
Every distance and travel time in a route plan SHALL come from a route along the street network for the travel mode:
- walking uses a walking route;
- moto and car use a driving route;
- bus/TransMilenio uses the driving route plus an average wait, and SHALL be labeled as an estimate without schedules.

A straight-line distance SHALL NOT be shown, and SHALL NOT be used for costs, limits or recommendations. It MAY only be used to shortlist which branches to route.

When no route can be obtained, that option SHALL NOT be offered, and the plan SHALL say a route couldn't be calculated.

#### Scenario: Route longer than the straight line
- **WHEN** two points in Chapinero are 880 m apart in a straight line, and the walking route between them is 1,194 m and 16 minutes
- **THEN** the plan shows 1,2 km and 16 minutes

#### Scenario: Routing service down
- **WHEN** the routing service doesn't answer for the "+ Carulla" option
- **THEN** that option isn't offered, and the plan says "No pudimos calcular la ruta a Carulla"

### Requirement: Options computed from prices and routes
With an anchor set, the planner SHALL compute these options:
- buying everything at the anchor;
- for each other enabled chain, the anchor plus that chain's branch that adds the least route time.

For each option it SHALL compute, deterministically:
- the goods total from stored prices, and the saving against the anchor-only option;
- the extra route distance and minutes for the whole trip (from the person's location when known, otherwise from the anchor and back);
- the travel cost for the chosen mode;
- the net saving: saving minus travel cost.

An extra stop SHALL be offered only when it adds at most the mode's limit, by route: 20 minutes on foot, 30 by bus, 25 by moto or car.

Every number SHALL come from stored prices, routes and these formulas, never from a model.

#### Scenario: A store next door pays off
- **WHEN** the anchor is a D1, a Carulla adds a 600 m walking route (8 minutes), and buying 3 items at Carulla saves $12.300
- **THEN** the "D1 + Carulla" option shows a $12.300 saving, 8 extra minutes, $0 travel cost and a $12.300 net saving

#### Scenario: A store too far
- **WHEN** the best Jumbo adds 45 minutes by bus to the trip
- **THEN** no "+ Jumbo" option is offered

### Requirement: Muse recommends one option and explains
Muse SHALL receive the computed options (with their numbers), the travel mode, the person's note, and which items are cold or heavy. Muse SHALL NOT receive individual prices to recompute. Muse SHALL:
- recommend exactly one option;
- explain it in at most two sentences of plain Spanish, using only the numbers it was given;
- MAY instead ask one follow-up question when a missing fact would change the choice.

The app SHALL reject an answer that names an option not offered, and SHALL use the fallback instead. A number in the explanation that isn't one of the given figures SHALL also trigger the fallback.

**Fallback,** when Muse is unavailable or its answer is rejected: recommend the option with the largest net saving, if that is at least $3.000 and at least 5% of the anchor-only total. Otherwise recommend the anchor alone. The fallback uses a fixed explanation template.

#### Scenario: Worth it on foot
- **WHEN** the options are "solo D1 $84.500" and "D1 + Carulla, 600 m caminando, ahorras $12.300, 8 min más", and the person walks with no note
- **THEN** Muse recommends D1 + Carulla, with an explanation like "Carulla queda a 600 m caminando de tu D1: ahorras $12.300 por 8 minutos más"

#### Scenario: Not worth it for this person
- **WHEN** the extra stop nets $4.000, and the person's note says "voy con bebé y llevo el mercado a pie"
- **THEN** Muse may recommend staying at the anchor, saying the $4.000 doesn't justify the extra walk with the load

#### Scenario: Muse invents a figure
- **WHEN** Muse's explanation states a saving that isn't among the given figures
- **THEN** the app shows the fallback recommendation and template text instead

### Requirement: One route, in order, on a map
The recommended plan SHALL show:
- the stops in visiting order, chosen by route time, with branch name, address and route distance from the previous point;
- each stop's items, with the anchor-only items at the anchor;
- cold and heavy items at the last stop;
- totals per stop and overall;
- the net saving against buying everything at the anchor.

**Map.** The plan SHALL show the route on a map: the line along the streets from the starting point through each stop, numbered markers, and the total route distance and time. The map SHALL carry the OpenStreetMap attribution.

**Steps.** The plan SHALL list the route's turn-by-turn steps in Spanish (e.g. "Gira a la derecha en la Calle 57"), grouped by leg.

**Navigation.** A "Navegar" action SHALL open the route for live guidance:
- in Google Maps, with every stop as a waypoint and the matching travel mode;
- or in Waze, toward the next stop.

Rinde itself doesn't give live guidance.

Muse MAY order the items within each stop. When the recommendation is the anchor alone, the plan SHALL say how much the best extra stop would have saved.

The plan SHALL also state that online prices are the chain's, not the branch's, and may differ in store.

#### Scenario: Cold items last
- **WHEN** the route is D1, then Carulla, and the list has milk and frozen peas assigned to D1
- **THEN** the route is ordered so the stop with the cold items is visited last, or the plan says to pick them up last

#### Scenario: Navigate the plan
- **WHEN** the plan is D1, then Carulla, on foot, and the person taps "Navegar" and picks Google Maps
- **THEN** Google Maps opens walking directions from their location through the D1 to the Carulla

#### Scenario: Staying is better
- **WHEN** Muse recommends the anchor alone
- **THEN** the plan lists everything at the anchor and notes, e.g., "Si pasas por Carulla ahorrarías $4.000"
