# Meta Muse: same product across stores (held-out set)

Run 2026-10-29 with `muse-spark-1.3` on 95 cases (80 with the product in the other store's list, 15 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands and sizes only, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked |
| --- | --- | --- | --- | --- | --- |
| Meta Muse | 85.3 % | 83.8 % | 93.3 % | 95.7 % | 3 |
| Word rule (no AI) | 44.2 % | 33.8 % | 100.0 % | 100.0 % | 0 |


Muse time per judgment: median 2.0 s, 90th percentile 4.7 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **none-2**: Leche COLANTA entera pasteurizada (1000  ml) (carulla)
  - expected: none
  - Muse: Leche Entera Colanta Tetrapack x1000ml (jumbo), "Misma leche Colanta entera de 1000 ml; la tienda solo aclara que es Tetrapack"
- **find-18**: Cereal FLIPS relleno de chocolate (400  gr) (exito)
  - expected: Cereal Flips choco avellanas x320g (jumbo)
  - Muse: none, "Ambos son sabor choco avellanas, no relleno solo de chocolate."
- **find-22**: Tamarindo roy puro x 500 gr (jumbo)
  - expected: TAMARINDO SIN AZUCAR  500  gr (carulla)
  - Muse: none, "Ninguno es igual: el 0 es tamarindo sin azúcar, no roy puro, y el 1 es frijol."
- **find-26**: Sardina VIGILANTE tomate x 120 g (jumbo)
  - expected: Sardinas VIGILANTE picantes en tomate (88  gr) (carulla)
  - Muse: none, "Ninguna es igual: la 0 es picante en tomate y la 1 es en aceite, no en tomate normal."
- **find-36**: Pastas PASTAS EL DORADO lenteja roja (250  gr) (carulla)
  - expected: Pasta El Dorado spaghetti lentejas rojas arroz x250g (jumbo)
  - Muse: none, "Ninguna es igual: la 0 es spaghetti de lentejas rojas con arroz y la 1 es coditos de lenteja común, no pasta de lenteja roja de 250 g."
- **find-37**: Galletas MC.VITIES de fruta (174  gr) (carulla)
  - expected: Galletas Mcvities Frutos Rojos 174g (jumbo)
  - Muse: none, "Una es de manzana y la otra de frutos rojos, no es la misma galleta de fruta buscada"
- **find-40**: Pastas PASTAS EL DORADO lentejas rojas coditos (250  gr) (carulla)
  - expected: Pasta el dorado coditos lentejas sin gluten Oliva x 250 g (jumbo)
  - Muse: none, "Ninguna es igual: la 0 es spaghetti no coditos y la 1 es de lentejas sin decir rojas"
- **find-43**: Lavaloza DERSA liquido desengrasante (750  ml) (exito)
  - expected: Lavaloza Dersa + Jabon Rey x750ml (jumbo)
  - Muse: none, "Ninguno es desengrasante: el 0 es desinfectante y el 1 es combinado con Jabón Rey"
- **find-45**: Coca-Cola Gaseosa Sabor Original 3L (jumbo)
  - expected: Gaseosa COCA COLA familiar (3000  ml) (carulla)
  - Muse: Gaseosa  COCA COLA original (3000  ml) (carulla), "Misma gaseosa Coca-Cola sabor original de 3 L; la tienda solo cambia el orden de las palabras"
- **find-57**: Lavaloza DERSA líquido máximo poder limón  (750  ml) (carulla)
  - expected: Lavaloza liquido Dersa desinfectante botellax750ml (jumbo)
  - Muse: none, "Ninguno es máximo poder limón: uno es desinfectante y el otro con Jabón Rey."
- **find-61**: Lavaloza AXION crema lima limón (450  gr) (carulla)
  - expected: Lavaplatos en Crema Axion Explosión Cítrica 450g (jumbo)
  - Muse: none, "Ninguno es lima limón: uno es variedad Blue y el otro Explosión Cítrica"
- **find-62**: Café Juan Valdez Cumbre Molido 454gr (jumbo)
  - expected: Café JUAN VALDEZ molido (454  gr) (carulla)
  - Muse: none, "Ninguno es Cumbre molido: el 0 no especifica la línea Cumbre y el 1 es Finca en grano, no molido."
- **find-63**: Chocolate LYNE clásico (200  gr) (carulla)
  - expected: Chocolate Lyne polvo clásico sin azúcar x200g (jumbo)
  - Muse: none, "Ambos son Lyne sin azúcar / con Splenda, no el clásico normal con azúcar."
- **find-73**: Aceite DIANA Aceite Cocina (3000  ml) (carulla)
  - expected: Aceite Diana Vitamor 3000ml (jumbo)
  - Muse: Aceite Diana vitaminas x3000ml (jumbo), "Mismo aceite Diana de cocina de 3000 ml; la tienda aclara que es con vitaminas"

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.heldout.cases.json`. Run: `MUSE_EVAL=1 MUSE_EVAL_SET=heldout INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
