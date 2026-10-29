# Meta Muse: same product across stores

Run 2026-10-29 with `muse-spark-1.3` on 120 cases (80 with the product in the other store's list, 40 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands and sizes only, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked |
| --- | --- | --- | --- | --- | --- |
| Meta Muse | 90.0 % | 88.8 % | 92.5 % | 94.7 % | 4 |
| Word rule (no AI) | 57.5 % | 37.5 % | 97.5 % | 96.8 % | 1 |


**After a person read every disagreement** (`eval/same-product.review.json`): 105 of 116 right, **90.5 %**, with 4 wrong products picked. 4 cases were set aside because the stores' own names can't tell the products apart, and 2 counted for Muse because both listings are the same product under different barcodes. 1 disagreements are not reviewed yet.

Muse time per judgment: median 2.0 s, 90th percentile 4.1 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **find-2**: Suavizante SUAVITEL jazmín eucalipto (1500  ml) (exito)
  - expected: Suavizante Suavitel Brisa de Jazmín 1.5 L (jumbo)
  - Muse: none, "Ninguno es jazmín eucalipto; el 0 es Brisa de Jazmín y los demás son lavanda y fresca primavera"
- **find-12**: Vino Tinto Convento Da Vila Blend Alentejano750ml (jumbo)
  - expected: Vino tinto CONVENTO DA VILA alentejano Otra Cepa (750  ml) (exito)
  - Muse: none, "Ninguno es blend: el tinto es otra cepa y el otro es vino blanco."
  - review: muse-wrong, Same red wine (Blend = Otra Cepa); Muse's reason mixes it up with the white.
- **find-14**: Café Quindío Buenavista Molido x340 grs (jumbo)
  - expected: Café CAFE QUINDIO molido especial origen (340  gr) (carulla)
  - Muse: none, "Ninguno es de la línea Buenavista; son orgánico, especial, espresso o genérico"
  - review: muse-wrong, Picked a different Café Quindío line (tostado y molido) for Buenavista.
- **find-18**: Harina Karavansay precocida (500  gr) (carulla)
  - expected: Harina Karavansay quinua x500g (jumbo)
  - Muse: none, "Ninguna es harina precocida; son de garbanzo, quinua y arroz integral."
  - review: unclear, Éxito and Carulla call three Karavansay flours just "precocida"; the name can't say which one.
- **find-21**: Harina Karavansay precocida (500  gr) (exito)
  - expected: Harina de Garbanzo Karavansay x500grs (jumbo)
  - Muse: none, "Ninguna es harina precocida; son de garbanzo, quinua y arroz integral."
  - review: unclear, Same vague "precocida" name as find-18.
- **find-38**: Panela Pulverizada DORIGENN 500  gr (carulla)
  - expected: Panela Fonce orgánica pulverizada x500g (jumbo)
  - Muse: Panela Fonce pulverizada natural x500g (jumbo), "Misma panela Fonce pulverizada natural de 500 g; DORIGENN abrevia de origen natural, no es la orgánica"
  - review: muse-wrong, Picked the natural Fonce panela; the barcode twin is the organic one.
- **find-51**: Mantequilla COLANTA en barra esparcible (250  gr) (exito)
  - expected: Mantequilla Colanta con sal x250g (jumbo)
  - Muse: none, "La buscada no dice si es con sal o sin sal y hay dos versiones distintas."
  - review: muse-wrong, Picked sin sal for a butter the other store sells as con sal.
- **find-76**: Harina Karavansay integral precocida (500  gr) (carulla)
  - expected: Harina de Arroz Integral Karavansay x500grs (jumbo)
  - Muse: none, "Ninguna es la misma harina integral precocida; son de arroz, de garbanzo y de quinua."
  - review: unclear, Same vague "integral precocida" name; Jumbo calls it rice flour.
- **find-78**: Harina BIO PLAZA de yuca (500  gr) (exito)
  - expected: Tapioca Bio Plaza sin gluten x500g (jumbo)
  - Muse: none, "Ninguna es harina de yuca; la más cercana es tapioca, que es almidón y no la misma harina."
  - review: unclear, One store says yuca flour, the other tapioca for one barcode.
- **none-10**: Aguardiente Antioqueño S/A 1050 Ml (d1)
  - expected: none
  - Muse: Aguardiente ANTIOQUENO verde sin azúcar caja (1050  ml) (exito), "Mismo Aguardiente Antioqueño verde sin azúcar de 1050 ml; S/A significa sin azúcar"
  - review: muse-right, S/A is sin azúcar: the same aguardiente, listed under another barcode.
- **none-32**: Leche ALQUERIA deslactosada caja (1000  ml) (carulla)
  - expected: none
  - Muse: Leche Alquería deslactosada 1000ml (jumbo), "Misma leche Alquería deslactosada de 1000 ml; que no diga caja no la hace distinta"
  - review: muse-right, Same Alquería lactose-free litre; the other listing has another barcode.
- **none-34**: Arroz Diana blanco x1kg (jumbo)
  - expected: none
  - Muse: Arroz DIANA blanco premium (1000  gr) (carulla), "Mismo arroz Diana blanco de 1 kg; la tienda solo agrega premium"
  - review: muse-wrong, Diana Premium is a different rice line from Diana blanco.

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.cases.json`. Run: `MUSE_EVAL=1 INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
