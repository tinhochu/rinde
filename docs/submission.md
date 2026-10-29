# Submission: Rinde

Text for the hackathon form. Every figure here is in the README or `apps/web/eval/`, and every price the app shows comes from a store.

**Name:** Rinde

**Tagline:** Your grocery list, at the Colombian supermarkets where it costs least.

**Theme:** Build for Your World

**Links**
- App (installable PWA): https://app.rinde.cool.chuventures.com
- Landing page: https://rinde.cool.chuventures.com
- Code: https://github.com/tinhochu/rinde

## Inspiration

Food takes a large share of a Colombian family's budget, and the same list costs tens of thousands of pesos more or less depending on whether you buy it at D1, Jumbo, Éxito or Carulla. Nobody has time to check four stores, and the stores name and package the same product differently, so even comparing two of them by hand is slow.

## What it does

You write your list the way you'd write it ("3 kilos de arroz, 30 huevos, leche"), paste it, or photograph a handwritten one. Rinde finds each item at the four stores, checks the prices live, and gives a plan: where to buy what, the total, and how much you save against buying everything at one store. Over budget, it proposes changes (another store, another brand, a smaller pack, dropping an optional item), each with its exact saving, and changes nothing until you accept. It plans the trip from the supermarket you usually go to, on foot, by bus, by moto or by car, and says whether one more stop is worth it. Receipts, photographed or forwarded as a DIAN e-invoice, become fresh in-store prices.

## How we built it with Meta

**Meta Muse does the reasoning; code does all the money.** Muse never produces, sees or adjusts a price.

Muse (`muse-spark-1.3`, through the Meta Model API) does six jobs:
- reads a photo of a handwritten list into items and amounts;
- keeps the products a shopper would accept for "leche" or "arroz";
- decides whether a listing at another store is the same product, from the names **and the stores' package photos**, with a one-line reason;
- groups similar products of other brands, compared by price per kg, L or unit;
- reads receipts and matches their abbreviated lines to products;
- explains which route suits the shopper, and every number it writes is checked against the figures the code gave it.

When Muse is unavailable, each step falls back to a deterministic rule, so a plan never fails because of the model.

**Measured, not claimed.** Matching the same product across stores is where a wrong answer costs most: it would show one product's price for another. We scored it against barcodes. Products that two stores sell under one EAN give the right answer without anyone labeling it, and Muse never sees the barcode.

| | Held-out test (95 cases): correct | Wrong products picked |
|---|---|---|
| Word rule, no AI | 44.2 % | 0 (it rarely picks anything) |
| Muse, names only | 84.2 % | 4 |
| Muse, names and package photos | **97.9 %** | **0** |

The photos settle what names can't: milk in a bag against a carton, or three flours every store calls "precocida". In Muse's words: *"La foto del comprador es la galleta morada de frutos rojos, no la verde de manzana."* When names and photos still can't tell, Muse says "not sure" and the app shows no price for that store rather than guessing.

**Stack:** Expo (iOS, Android and the PWA), a Next.js API, a worker for nightly price snapshots, Postgres with every price stored with its store, source URL and time, OpenStreetMap routing, all self-hosted on Coolify.

## Challenges

- The stores' catalogs are rate-limited and inconsistent. Requests go one at a time with pauses and back off after any 429; a price that couldn't be checked live is labeled with its date.
- Same product, different name, different barcode. Rules alone found about a third of the matches, and the prompt alone hit a ceiling around 85 to 90 %. The stores' own package photos took it past that.
- Keeping the model honest: it reads, judges and explains, but no number it writes reaches the screen unchecked.

## What we're proud of

- A plan you can trust line by line: every price links to the store's page with the time it was checked, and every total is code.
- The measurement, including its caveats: about 4 in 10 test cases have near-identical photos, the gain holds on the ones where the photos differ, and both test sets were looked at while tuning. Full reports are in `apps/web/eval/`.

## What's next

- Measure receipt reading the same way, line by line against receipts with known totals.
- Let the shopper choose when Muse is still not sure, and keep that choice as a confirmed match for the next person.
- More cities and stores.
