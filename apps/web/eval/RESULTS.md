# Meta Muse: same product across stores

Run 2026-10-29 with `muse-spark-1.3` on 120 cases (80 with the product in the other store's list, 40 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands and sizes only, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked | Said "not sure" |
| --- | --- | --- | --- | --- | --- | --- |
| Meta Muse | 89.2 % | 87.5 % | 92.5 % | 94.6 % | 4 | 7 |
| Word rule (no AI) | 57.5 % | 37.5 % | 97.5 % | 96.8 % | 1 | n/a |

"Not sure" shows no price for that store and says why; it is never a wrong price. Not sure on: find-18 (product was there), find-21 (product was there), find-36 (product was there), find-51 (product was there), find-76 (product was there), none-5 (product was not there), none-31 (product was not there).


**After a person read every disagreement** (`eval/same-product.review.json`): 105 of 116 right, **90.5 %**, with 3 wrong products picked. 4 cases were set aside because the stores' own names can't tell the products apart, and 2 counted for Muse because both listings are the same product under different barcodes. 1 disagreements are not reviewed yet.

Muse time per judgment: median 2.1 s, 90th percentile 5.2 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **find-12**: Vino Tinto Convento Da Vila Blend Alentejano750ml (jumbo)
  - expected: Vino tinto CONVENTO DA VILA alentejano Otra Cepa (750  ml) (exito)
  - Muse: none, "El tinto disponible es Otra Cepa, no Blend, y el otro es vino blanco"
  - review: muse-wrong, Same red wine (Blend = Otra Cepa); Muse's reason mixes it up with the white.
- **find-14**: Café Quindío Buenavista Molido x340 grs (jumbo)
  - expected: Café CAFE QUINDIO molido especial origen (340  gr) (carulla)
  - Muse: none, "Ninguno es de la línea Buenavista; son orgánico, especial, espresso, descafeinado o genérico"
  - review: muse-wrong, Picked a different Café Quindío line (tostado y molido) for Buenavista.
- **find-18**: Harina Karavansay precocida (500  gr) (carulla)
  - expected: Harina Karavansay quinua x500g (jumbo)
  - Muse: not sure, "El nombre solo dice precocida y no aclara si es de garbanzo, quinua o arroz integral"
  - review: unclear, Éxito and Carulla call three Karavansay flours just "precocida"; the name can't say which one.
- **find-20**: Café Quindío Vainilla Cosecha Especial Molido x250 grs (jumbo)
  - expected: Café CAFE QUINDIO tostado notas vainilla dulce (250  gr) (carulla)
  - Muse: none, "Ninguno es a la vez vainilla y cosecha especial molido; el 0 es solo cosecha y el 1 es solo vainilla."
  - review: muse-wrong, Vanilla notes, same brand and size: it is the same coffee.
- **find-21**: Harina Karavansay precocida (500  gr) (exito)
  - expected: Harina de Garbanzo Karavansay x500grs (jumbo)
  - Muse: not sure, "El nombre no dice si es de garbanzo, quinua o arroz"
  - review: unclear, Same vague "precocida" name as find-18.
- **find-36**: Aguardiente Antioqueño tetra prisma x 1050 ml (jumbo)
  - expected: Aguardiente ANTIOQUENO rojo caja (1050  ml) (exito)
  - Muse: not sure, "El nombre no dice si es verde, rojo o azul sin azúcar"
- **find-38**: Panela Pulverizada DORIGENN 500  gr (carulla)
  - expected: Panela Fonce orgánica pulverizada x500g (jumbo)
  - Muse: Panela Fonce pulverizada natural x500g (jumbo), "Misma panela Fonce pulverizada natural de 500 g; DORIGENN abrevia de origen natural"
  - review: muse-wrong, Picked the natural Fonce panela; the barcode twin is the organic one.
- **find-51**: Mantequilla COLANTA en barra esparcible (250  gr) (exito)
  - expected: Mantequilla Colanta con sal x250g (jumbo)
  - Muse: not sure, "El nombre no dice si es con sal o sin sal"
  - review: muse-wrong, Picked sin sal for a butter the other store sells as con sal.
- **find-76**: Harina Karavansay integral precocida (500  gr) (carulla)
  - expected: Harina de Arroz Integral Karavansay x500grs (jumbo)
  - Muse: not sure, "El nombre no dice si es de arroz, garbanzo o quinua"
  - review: unclear, Same vague "integral precocida" name; Jumbo calls it rice flour.
- **find-78**: Harina BIO PLAZA de yuca (500  gr) (exito)
  - expected: Tapioca Bio Plaza sin gluten x500g (jumbo)
  - Muse: none, "Ninguna es harina de yuca; solo hay de lentejas, plátano, arroz, frijol, avena y tapioca."
  - review: unclear, One store says yuca flour, the other tapioca for one barcode.
- **none-10**: Aguardiente Antioqueño S/A 1050 Ml (d1)
  - expected: none
  - Muse: Aguardiente ANTIOQUENO verde sin azúcar caja (1050  ml) (exito), "Mismo Aguardiente Antioqueño verde sin azúcar de 1050 ml; la tienda aclara verde y caja"
  - review: muse-right, S/A is sin azúcar: the same aguardiente, listed under another barcode.
- **none-32**: Leche ALQUERIA deslactosada caja (1000  ml) (carulla)
  - expected: none
  - Muse: Leche Alquería deslactosada 1000ml (jumbo), "Misma leche Alquería deslactosada de 1000 ml; que no diga caja no la hace distinta"
  - review: muse-right, Same Alquería lactose-free litre; the other listing has another barcode.
- **none-34**: Arroz Diana blanco x1kg (jumbo)
  - expected: none
  - Muse: Arroz DIANA blanco premium (1000  gr) (carulla), "Mismo arroz DIANA blanco de 1 kg; la tienda solo agrega premium al nombre"
  - review: muse-wrong, Diana Premium is a different rice line from Diana blanco.

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.cases.json`. Run: `MUSE_EVAL=1 INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
