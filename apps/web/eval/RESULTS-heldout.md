# Meta Muse: same product across stores (held-out set)

Run 2026-10-29 with `muse-spark-1.3` on 95 cases (80 with the product in the other store's list, 15 without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands and sizes only, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked |
| --- | --- | --- | --- | --- | --- |
| Meta Muse | 86.3 % | 86.3 % | 86.7 % | 94.5 % | 4 |
| Word rule (no AI) | 44.2 % | 33.8 % | 100.0 % | 100.0 % | 0 |


Muse time per judgment: median 2.1 s, 90th percentile 4.2 s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

- **find-17**: Detergente Blancox liquido detergente x 1.8L (jumbo)
  - expected: Detergente líquido BLANCOX blancos radiantes (1800  ml) (carulla)
  - Muse: none, "Ninguno es el detergente genérico; uno es línea Blancos Radiantes y el otro es Multiusos Bicarbonato"
- **none-2**: Leche COLANTA entera pasteurizada (1000  ml) (carulla)
  - expected: none
  - Muse: Leche Entera Colanta Tetrapack x1000ml (jumbo), "Misma leche Colanta entera de 1 L; pasteurizada y Tetrapack solo describen la presentación"
- **find-18**: Cereal FLIPS relleno de chocolate (400  gr) (exito)
  - expected: Cereal Flips choco avellanas x320g (jumbo)
  - Muse: none, "Ambos son cereal choco avellanas, no el relleno solo de chocolate."
- **find-26**: Sardina VIGILANTE tomate x 120 g (jumbo)
  - expected: Sardinas VIGILANTE picantes en tomate (88  gr) (carulla)
  - Muse: none, "La buscada es en tomate natural, no picante ni en aceite vegetal."
- **find-37**: Galletas MC.VITIES de fruta (174  gr) (carulla)
  - expected: Galletas Mcvities Frutos Rojos 174g (jumbo)
  - Muse: none, "Las opciones son de manzana y de frutos rojos, sabores específicos distintos a la de fruta buscada"
- **find-43**: Lavaloza DERSA liquido desengrasante (750  ml) (exito)
  - expected: Lavaloza Dersa + Jabon Rey x750ml (jumbo)
  - Muse: none, "Ninguno es igual: uno es desinfectante no desengrasante y el otro es con Jabón Rey"
- **find-45**: Coca-Cola Gaseosa Sabor Original 3L (jumbo)
  - expected: Gaseosa COCA COLA familiar (3000  ml) (carulla)
  - Muse: Gaseosa  COCA COLA original (3000  ml) (carulla), "Misma gaseosa Coca-Cola sabor original de 3 L; la tienda solo cambia el orden de las palabras"
- **none-10**: Leche COLANTA entera en caja (1000  ml) (exito)
  - expected: none
  - Muse: Leche Entera Colanta Pasteurizada x1lt (jumbo), "Misma leche Colanta entera de 1 L; pasteurizada solo la describe y no cambia el producto"
- **find-57**: Lavaloza DERSA líquido máximo poder limón  (750  ml) (carulla)
  - expected: Lavaloza liquido Dersa desinfectante botellax750ml (jumbo)
  - Muse: none, "Ninguno es de limón máximo poder; uno es desinfectante y el otro con Jabón Rey"
- **find-61**: Lavaloza AXION crema lima limón (450  gr) (carulla)
  - expected: Lavaplatos en Crema Axion Explosión Cítrica 450g (jumbo)
  - Muse: none, "Ninguno es lima limón: uno es Blue 7 en 1 y el otro es Explosión Cítrica."
- **find-62**: Café Juan Valdez Cumbre Molido 454gr (jumbo)
  - expected: Café JUAN VALDEZ molido (454  gr) (carulla)
  - Muse: none, "Ninguno confirma ser Cumbre molido: el 0 es molido genérico sin línea y el 1 es Finca en grano"
- **find-63**: Chocolate LYNE clásico (200  gr) (carulla)
  - expected: Chocolate Lyne polvo clásico sin azúcar x200g (jumbo)
  - Muse: none, "Ninguno es el clásico con azúcar; los dos son versiones sin azúcar, uno con Splenda."
- **find-73**: Aceite DIANA Aceite Cocina (3000  ml) (carulla)
  - expected: Aceite Diana Vitamor 3000ml (jumbo)
  - Muse: Aceite Diana vitaminas x3000ml (jumbo), "Mismo aceite Diana de cocina de 3000 ml; la tienda solo agrega que tiene vitaminas"

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: `eval/same-product.heldout.cases.json`. Run: `MUSE_EVAL=1 MUSE_EVAL_SET=heldout INTEGRATION=1 npx vitest run src/server/eval` in apps/web.
