# Demo script (3 minutes)

For the live final on Nov 9. Use a phone-sized browser window at https://app.rinde.cool.chuventures.com, or the installed PWA.

## Before going on

- [ ] Run `E2E_BASE_URL=https://app.rinde.cool.chuventures.com pnpm e2e` within the hour before. It must pass 13/13. This also warms the route and price caches.
- [ ] Plan the family list once (below), so its routes are cached.
- [ ] Have the list text ready to paste.
- [ ] Use a fresh browser profile, or clear site data, so the install sheet appears on landing.
- [ ] Backup: screen recording of a full run, in case the venue's network fails.

## The list (paste as is)

```
3 kilos de arroz blanco
1 litro de aceite vegetal
6 litros de leche entera
30 huevos
1 kilo de panela
500 g de café molido
1 kilo de azúcar
1 kilo de fríjol
500 g de lenteja
pasta spaghetti 1 kg
3 latas de atún
2 kilos de pechuga de pollo
3 kilos de papa pastusa
1 kilo de tomate
4 plátanos verdes
```

## Script

**0:00. The problem (15 s).** "A family in Bogotá spends about a third of its income on food. Prices for the same list differ by tens of thousands of pesos between D1, Jumbo, Éxito and Carulla, and nobody has time to check four stores."

**0:15. Open the app (15 s).** Land on the app. After 2 seconds the install sheet slides up. "It's a PWA: one tap and it lives on your home screen." Tap "Ahora no".

**0:30. The list (20 s).** Mi plan → "Pegar lista" → paste → "Agregar a mi lista". "Fifteen items, written the way people write them. Muse can also read a photo of a handwritten list." Tap café molido, plátano verde and atún, and switch off "Imprescindible" on each: "These I can live without if money's short."

**0:50. Budget and plan (40 s).** Continuar → Semanal → $150 mil → "Ver dónde rinde más".
- While it works: "These are live calls. It's re-checking prices at each store right now." Point at the "Verificando D1…" progress line.
- On the result: "D1 for twelve items, Jumbo for three: about $190 mil, and $75 mil less than buying everything at Jumbo. Four plantains are priced by the piece, not by the kilo. Every price links to the store's page with the time it was checked. Muse decided that Latti milk counts as 'leche entera'. The code did all the arithmetic."

**1:30. Over budget (30 s).** "I'm about $40 mil over budget." Scroll to the proposals. "It never hides the overage. Each proposal shows its exact saving, recalculated." Accept "Quitar café molido", "Quitar plátano verde" and "Quitar atún en lata". The plan is now within budget, at about $144 mil. Rehearsed numbers: `docs/demo-baseline.md`.

**2:00. The trip (45 s).** Results → "Planear mi ruta" → Carulla chip → "Usar mi ubicación" → the nearest Carulla → "A pie".
- "Is one extra stop worth it? Muse looks at the real street routes and the savings, and explains." Read the advice aloud.
- Pick the "Carulla + D1" option. "Real streets, cold items at the last stop, and the net saving after the walk." Open "Navegar" → Google Maps opens with both stops.

**2:45. Close (15 s).** "Muse reads lists, receipts and product names, and gives advice. It never produces a price. The prices come from the stores and the math comes from code. That's how Rinde can say exactly how much you save."

## If something fails

| What | Say and do |
|---|---|
| A store doesn't answer the live check | "Éxito didn't answer, so Rinde uses its latest catalog price and labels it." Keep going. |
| The plan is slow (more than 20 s) | Talk through the list wording while it loads. Route results are cached once a plan has run. |
| Muse is down | Plans still work on the rule fallbacks; skip the advice line and show the options. |
| No network | Switch to the backup recording. |
