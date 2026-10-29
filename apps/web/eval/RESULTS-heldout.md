# Meta Muse: same product across stores (held-out set)

Run 2026-10-29 with `muse-spark-1.3` on 95 cases (80 with the product in the other store's list, 15 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands and sizes only, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked | Said "not sure" |
| --- | --- | --- | --- | --- | --- | --- |
| Meta Muse | 84.2 % | 83.8 % | 86.7 % | 94.4 % | 4 | 3 |
| Word rule (no AI) | 44.2 % | 33.8 % | 100.0 % | 100.0 % | 0 | n/a |

"Not sure" shows no price for that store and says why; it is never a wrong price. Not sure on: find-17 (product was there), find-36 (product was there), find-37 (product was there).


Muse time per judgment: median 2.0 s, 90th percentile 4.6 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **find-17**: Detergente Blancox liquido detergente x 1.8L (jumbo)
  - expected: Detergente líquido BLANCOX blancos radiantes (1800  ml) (carulla)
  - Muse: not sure, "El nombre no dice si es blancos radiantes o multiusos bicarbonato"
- **none-2**: Leche COLANTA entera pasteurizada (1000  ml) (carulla)
  - expected: none
  - Muse: Leche Entera Colanta Tetrapack x1000ml (jumbo), "Misma leche Colanta entera de 1 L; tetrapak solo lo dice la tienda y pasteurizada es descriptivo"
- **find-18**: Cereal FLIPS relleno de chocolate (400  gr) (exito)
  - expected: Cereal Flips choco avellanas x320g (jumbo)
  - Muse: none, "Los disponibles son de choco avellanas, no relleno de chocolate"
- **find-22**: Tamarindo roy puro x 500 gr (jumbo)
  - expected: TAMARINDO SIN AZUCAR  500  gr (carulla)
  - Muse: none, "Ninguno es tamarindo roy puro; el 0 es sin azúcar y el 1 es fríjol"
- **find-26**: Sardina VIGILANTE tomate x 120 g (jumbo)
  - expected: Sardinas VIGILANTE picantes en tomate (88  gr) (carulla)
  - Muse: none, "La buscada es en tomate sin picante, pero una es picante y la otra en aceite vegetal"
- **find-36**: Pastas PASTAS EL DORADO lenteja roja (250  gr) (carulla)
  - expected: Pasta El Dorado spaghetti lentejas rojas arroz x250g (jumbo)
  - Muse: not sure, "El nombre no dice si es spaghetti o coditos y ambos podrían ser de lenteja roja"
- **find-37**: Galletas MC.VITIES de fruta (174  gr) (carulla)
  - expected: Galletas Mcvities Frutos Rojos 174g (jumbo)
  - Muse: not sure, "Solo dice de fruta y no aclara si es de manzana o de frutos rojos"
- **find-40**: Pastas PASTAS EL DORADO lentejas rojas coditos (250  gr) (carulla)
  - expected: Pasta el dorado coditos lentejas sin gluten Oliva x 250 g (jumbo)
  - Muse: none, "Ninguno es igual: el 0 es spaghetti con arroz y el 1 es coditos con oliva, no coditos de lentejas rojas"
- **find-43**: Lavaloza DERSA liquido desengrasante (750  ml) (exito)
  - expected: Lavaloza Dersa + Jabon Rey x750ml (jumbo)
  - Muse: none, "Ninguno es desengrasante: uno es desinfectante y el otro es con Jabón Rey"
- **find-45**: Coca-Cola Gaseosa Sabor Original 3L (jumbo)
  - expected: Gaseosa COCA COLA familiar (3000  ml) (carulla)
  - Muse: Gaseosa  COCA COLA original (3000  ml) (carulla), "Misma gaseosa Coca-Cola sabor original de 3 L; la tienda la nombra igual"
- **none-10**: Leche COLANTA entera en caja (1000  ml) (exito)
  - expected: none
  - Muse: Leche Entera Colanta Pasteurizada x1lt (jumbo), "Misma leche Colanta entera de 1 L; pasteurizada solo la describe y no cambia el empaque"
- **find-57**: Lavaloza DERSA líquido máximo poder limón  (750  ml) (carulla)
  - expected: Lavaloza liquido Dersa desinfectante botellax750ml (jumbo)
  - Muse: none, "Ninguno es máximo poder limón: uno es desinfectante y el otro con Jabón Rey"
- **find-61**: Lavaloza AXION crema lima limón (450  gr) (carulla)
  - expected: Lavaplatos en Crema Axion Explosión Cítrica 450g (jumbo)
  - Muse: none, "Ninguno es lima limón: uno es Blue 7 en 1 y el otro es Explosión Cítrica"
- **find-63**: Chocolate LYNE clásico (200  gr) (carulla)
  - expected: Chocolate Lyne polvo clásico sin azúcar x200g (jumbo)
  - Muse: none, "El buscado es el clásico regular y las dos opciones son versiones sin azúcar y con splenda"
- **find-73**: Aceite DIANA Aceite Cocina (3000  ml) (carulla)
  - expected: Aceite Diana Vitamor 3000ml (jumbo)
  - Muse: Aceite Diana vitaminas x3000ml (jumbo), "Mismo aceite Diana de cocina de 3000 ml; la tienda solo aclara que tiene vitaminas"

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.heldout.cases.json`. Run: `MUSE_EVAL=1 MUSE_EVAL_SET=heldout INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
