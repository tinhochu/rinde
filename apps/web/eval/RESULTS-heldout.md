# Meta Muse: same product across stores (held-out set)

Run 2026-10-29 with `muse-spark-1.3` on 95 cases (80 with the product in the other store's list, 15 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands, sizes and the stores' product photos, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked | Said "not sure" |
| --- | --- | --- | --- | --- | --- | --- |
| Meta Muse | 97.9 % | 97.5 % | 100.0 % | 100.0 % | 0 | 0 |
| Word rule (no AI) | 44.2 % | 33.8 % | 100.0 % | 100.0 % | 0 | n/a |

Muse looked at the stores' product photos whenever two or more listings could be it, as in the app. Two stores often show the same manufacturer photo; see `eval/TUNING.md` for the score on cases where the photos look different.

"Not sure" shows no price for that store and says why; it is never a wrong price.


Muse time per judgment: median 2.8 s, 90th percentile 4.1 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **find-22**: Tamarindo roy puro x 500 gr (jumbo)
  - expected: TAMARINDO SIN AZUCAR  500  gr (carulla)
  - Muse: none, "El tuyo es tamarindo momposino puro y las opciones son un tamarindo F.B. sin azúcar y un fríjol."
- **find-26**: Sardina VIGILANTE tomate x 120 g (jumbo)
  - expected: Sardinas VIGILANTE picantes en tomate (88  gr) (carulla)
  - Muse: none, "Ninguna es la de tomate natural: la 0 es picante en tomate y la 1 es en aceite vegetal"

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.heldout.cases.json`. Run: `MUSE_EVAL=1 MUSE_EVAL_SET=heldout INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
