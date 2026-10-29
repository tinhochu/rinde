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

## Known gaps this run shows

- **Atún and tomate** find no product at any store. These are search misses, not missing products.
- **Plantains by the unit:** a list asking for 4 plantains gets 4 one-kilo bags. Items counted in units take one package per unit, and the per-plantain listing ("Plátano verde a $3.000", $2.990) has no stored size, so it isn't a candidate.
- **Éxito and Carulla live checks** fail from production: Grupo Éxito answers 429 to Rinde's User-Agent. Their lines fall back to the stored price, labeled as such.
