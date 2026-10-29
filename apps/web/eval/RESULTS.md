# Meta Muse: same product across stores

Run 2026-10-29 with `muse-spark-1.3` on 120 cases (80 with the product in the other store's list, 40 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands, sizes and the stores' product photos, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked | Said "not sure" |
| --- | --- | --- | --- | --- | --- | --- |
| Meta Muse | 99.2 % | 100.0 % | 97.5 % | 98.8 % | 1 | 0 |
| Word rule (no AI) | 57.5 % | 37.5 % | 97.5 % | 96.8 % | 1 | n/a |

Muse looked at the stores' product photos whenever two or more listings could be it, as in the app. Two stores often show the same manufacturer photo; see `eval/TUNING.md` for the score on cases where the photos look different.

"Not sure" shows no price for that store and says why; it is never a wrong price.


**After a person read every disagreement** (`eval/same-product.review.json`): 116 of 116 right, **100.0 %**, with 0 wrong products picked. 4 cases were set aside because the stores' own names can't tell the products apart, and 1 counted for Muse because both listings are the same product under different barcodes.

Muse time per judgment: median 2.8 s, 90th percentile 5.8 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **none-10**: Aguardiente Antioqueño S/A 1050 Ml (d1)
  - expected: none
  - Muse: Aguardiente ANTIOQUENO verde sin azúcar caja (1050  ml) (exito), "Es el mismo Aguardiente Antioqueño sin azúcar en caja de 1050 ml; la tienda lo llama verde por su etiqueta nueva"
  - review: muse-right, S/A is sin azúcar: the same aguardiente, listed under another barcode.

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.cases.json`. Run: `MUSE_EVAL=1 INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
