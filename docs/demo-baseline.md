# Demo baseline: a 15-item family list

Recorded 2026-10-28 on production (`rinde-api.cool.chuventures.com`, web `7d1ffaa`), as task 9.1 of `multi-store-trip-planner`.

## The list

Budget $200.000, default trip cost ($10.000 a stop), any brand allowed.

| Item | Amount |
|---|---|
| arroz blanco | 3 kg |
| aceite vegetal | 1 L |
| leche entera | 6 L |
| huevos | 30 und |
| panela | 1 kg |
| café molido | 500 g |
| azúcar | 1 kg |
| fríjol | 1 kg |
| lenteja | 500 g |
| pasta spaghetti | 1 kg |
| atún en lata | 3 und |
| pechuga de pollo | 2 kg |
| papa pastusa | 3 kg |
| tomate | 1 kg |
| plátano verde | 4 und |

## The plan

Two stops, **$178.750**, $21.250 under budget. Live checks: D1 9/9, Jumbo 4/4.

| Store | Item | Packs × price | Line |
|---|---|---|---|
| D1 | Aceite Vegetal Imatá 900 Ml | 2 × $6.950 | $13.900 |
| D1 | Leche Entera Pasteurizada Latti 1000 Ml | 6 × $3.100 | $18.600 |
| D1 | Huevo Tipo A Sol Naciente 30 Und | 1 × $13.490 | $13.490 |
| D1 | Panela Redonda 1000 Grs | 1 × $5.990 | $5.990 |
| D1 | Café Tostado/Molido Viejo Molino 500 Grs | 1 × $19.900 | $19.900 |
| D1 | Azúcar Morena 1000 Grs | 1 × $3.390 | $3.390 |
| D1 | Fríjol Caraota el Estío 500 Gr | 2 × $2.550 | $5.100 |
| D1 | Lenteja el Estío 500 Grs | 1 × $1.500 | $1.500 |
| D1 | Pechugas de Pollo Brasset 1100 G | 2 × $15.950 | $31.900 |
| Jumbo | Arroz Máxima Blanco x3000grs | 1 × $9.890 | $9.890 |
| Jumbo | Pasta spaghetti Pugliese x1000g | 1 × $5.290 | $5.290 |
| Jumbo | Papa parda pastusa x500gr | 6 × $4.980 | $29.880 |
| Jumbo | Plátano verde (sold by the kilo) | 4 × $4.980 | $19.920 |

Without a price: atún en lata, tomate.

Other options the plan offered: three stops (adding Éxito) at $177.255, and four stops at $177.205. Neither saves more than the extra trips cost.

## Hand check

Every line was checked against the database (`PriceObservation`, latest row per listing):

- All 13 prices equal the latest stored observation for their listing, and every line has a source and a date.
- packs × price equals each line, and the lines sum to the store subtotals and to the $178.750 total.
- The saving is $44.360: buying the same 12 items at Jumbo alone costs $191.210, and this plan pays $146.850 for them. That matches the reported saving.
- Items are split between two stores.

## Over budget: $150.000

The same list, with café, panela, pasta, atún, plátano and lenteja marked optional, is $28.750 over. Accepting proposals in order brings it within budget:

1. Also go to Éxito and Carulla: −$1.545 at the till.
2. 500 g of pasta instead of 1 kg: −$2.640.
3. Drop plátano verde: −$19.920.
4. Drop café molido: −$19.125.

Result: $135.520, $14.480 under budget, and no further proposals.

## Rerun after the search and size fixes

Recorded 2026-10-29 01:05 UTC on production (web `85f63cd`, worker `95ed660`), after the nightly snapshot of D1 and Jumbo. Same list, budget $200.000.

All 15 items now have a price. Two stops, **$189.890**: D1 for 12 items ($142.760), Jumbo for 3 ($47.130).

- **Atún en lata** comes from D1: 3 × Atún Rallado el Navío 170 Grs at $3.450 = $10.350. The search now relaxes "atún en lata" to "atún" for stores without a match.
- **Tomate** comes from D1: Tomate Chonto X 1000 G, $5.900.
- **Plátano verde** is bought by the piece: 4 × "Plátano verde a $3.000" at $2.990 = $11.960, instead of four 1 kg bags ($19.920).
- The baseline is now all 15 items at Jumbo, $265.820, so the reported saving is $75.930.

The total is higher than the first run's $178.750 because two more items are priced (atún and tomate, $16.250). It also reflects D1's snapshot picks: rice as 7 × 450 g, milk as 7 × 900 ml.

### Over budget: $150.000, the demo path

Everything is essential except café, panela, pasta, atún, plátano and lenteja. The plan starts **$39.890 over**. Accepting the three proposals a shopper would pick:

1. Quitar café molido: proposed −$19.900. The plan becomes $169.380, −$20.510.
2. Quitar plátano verde: −$11.960, to $157.420.
3. Quitar atún en lata: −$10.350, to **$144.040**, $5.960 under budget. No further proposals.

At step 1 the plan fell by $610 more than proposed. The replan picked D1's Panela Redonda ($5.990) over Panela Fraccionada ($6.600), and 6 × 1 L of Latti milk over 7 × 900 ml. See the first known gap below.

## Known gaps this run shows

- **First plan vs. replan (open):** Muse's kind filter runs again whenever an item's candidate set changes, and the first run of a list records new live listings. Muse can then keep a listing it dropped the first time, so a replan can come out cheaper by a few hundred pesos. Proposals never overstate a saving; the plan can only beat them.
- ~~Atún and tomate find no product~~: fixed in `59dbd94` and after (the looser search).
- ~~Plantains by the unit~~: fixed in `3725246`. Jumbo's per-piece listings are sized as 1 unit.
- **Éxito and Carulla live checks** fail from production: Grupo Éxito answers 429 to Rinde's User-Agent. Their lines fall back to the stored price, labeled as such.
