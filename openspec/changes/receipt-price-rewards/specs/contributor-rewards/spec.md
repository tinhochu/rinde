# Spec Delta

## Purpose

Rewards shoppers with points, badges and a neighborhood ranking for receipt prices that pass the checks, so contributing feels worthwhile without paying real money.

## ADDED Requirements

### Requirement: Points for accepted lines
The system SHALL award 10 points for each submitted receipt line that is confirmed, passes the line check, and is matched to a product. Excluded, unmatched or failing lines SHALL earn nothing. Points SHALL be shown on the confirmation screen right after submission.

#### Scenario: Receipt with mixed lines
- **WHEN** a receipt has 12 lines, of which 9 are confirmed and matched, 2 excluded and 1 unmatched
- **THEN** the contributor earns 90 points and sees "+90 puntos" with the breakdown

### Requirement: Bonus for filling gaps
The system SHALL award 15 extra points for a line whose product had no online price and no receipt price under 72 hours at that store at submission time, and for every produce line. A line SHALL receive at most one bonus.

#### Scenario: First price for a store
- **WHEN** a line prices a product at Éxito that had no current Éxito price
- **THEN** the line earns 25 points and is labeled "Primer precio en Éxito"

### Requirement: Badges
The system SHALL grant each badge once, when its condition is first met:
- "Primera factura" for the first accepted receipt.
- "Cazador de frutas" for 10 accepted produce lines.
- "Pionero" for 5 gap bonuses.
- "Constante" for accepted receipts on 4 different weeks.

#### Scenario: First receipt
- **WHEN** a contributor's first receipt is accepted
- **THEN** the confirmation screen announces the "Primera factura" badge, and Perfil lists it

### Requirement: Neighborhood leaderboard
The system SHALL rank contributors by points earned in the current week (Monday 00:00 to Sunday 23:59, Colombia time) within the user's selected zone. The ranking SHALL show a display name chosen by the contributor or "Vecino #<short id>", never data taken from a receipt. The contributor's own rank SHALL be shown even when outside the top 10.

#### Scenario: Viewing the ranking
- **WHEN** a contributor in Medellín opens the leaderboard
- **THEN** they see the top 10 Medellín contributors this week with their points, and their own position

### Requirement: Rewards follow the contributor
Points, badges and rank SHALL be tied to the device's anonymous session until the person signs in. On first sign-in, the system SHALL move them to the account. Points SHALL have no cash value and SHALL NOT be redeemable, and Perfil SHALL say so.

#### Scenario: Signing in later
- **WHEN** a contributor with 340 points on this device signs in for the first time
- **THEN** the account shows 340 points and the badges earned on the device

### Requirement: Rewards can be revoked for invalid receipts
The system SHALL remove a receipt's points, and any badge that no longer qualifies, if the receipt is later found to be a duplicate or invalid.

#### Scenario: Duplicate found later
- **WHEN** a receipt that earned 120 points is found to duplicate an earlier one
- **THEN** the 120 points are removed and the contributor's history says "Factura duplicada: −120"
