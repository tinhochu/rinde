# Tasks

## 1. Receipt parsing and checks (`packages/core/src/receipt/`)

- [x] 1.1 Define the extraction schema (header plus lines; every number as a printed string; optional code) and the parsed types. Verify that `pnpm --filter @rinde/core typecheck` passes.
- [x] 1.2 Implement the Colombian number and unit parser ("3.980" → 3980, "0,845 KG" → 845 g, UN/GR/KG/LT, discount lines). Unreadable strings parse to `null`, never to an estimate. Verify with unit tests covering thousands separators, decimal commas, weighed lines and blank input.
- [x] 1.3 Implement the line check (tolerance `max(1, qty)` pesos) and the receipt reconciliation (including discounts, returning the difference). Verify with tests for the spec's scenarios: 2 × 4.890 ≠ 8.780, and lines at 52.300 against a printed 53.300.
- [x] 1.4 Implement personal-data scrubbing: drop CC/NIT-with-digits lines, masked card numbers and approval codes. Verify with a test that "CC 1.017.xxx.xxx" appears in no output field.
- [x] 1.5 Implement the duplicate keys: invoice number normalization ("POS 1234-567890" and "POS1234 567890" are equal), CUFE normalization, and the header fingerprint (store | branch | minute | total). Verify with unit tests, including two different images of the same receipt giving the same keys.

## 2. Persistence (`packages/db`)

- [x] 2.1 Add a migration with these tables and columns. Verify that `prisma migrate dev` applies cleanly on the local database (port 5433), and that inserting a second confirmed receipt with the same store and invoice number fails while a second draft succeeds.
  - `Receipt`: status, store, branch, purchasedAt, total, invoiceNumber, cufe, headerFingerprint, imageHash and imagePath, with partial unique indexes on confirmed receipts for `imageHash`, `(store, invoiceNumber)`, `cufe` and `headerFingerprint` (raw SQL in the migration).
  - `DuplicateAttempt` (session, layer, matched receipt), plus `Contributor.suspendedUntil`.
  - `ReceiptLine`.
  - `ReceiptAlias`.
  - `ProduceItem`.
  - `Contributor`.
  - `RewardEvent`.
  - `ContributorBadge`.
  - `PriceObservation.receiptLineId`, plus an index on `(source, observedAt)`.
- [x] 2.2 Seed about 40 `ProduceItem` rows (slug, name, aliases, default unit) and the abbreviation dictionary. Verify that the seed runs idempotently twice.
- [x] 2.3 Add a `receipts` volume to `docker-compose.yml` (web and worker), and add `META_VISION_MODEL` and `DEMO_RECEIPTS` to `.env.example`. Verify with `docker compose config`.

## 3. Meta Model adapter (`apps/web/src/server/muse.ts`)

- [x] 3.1 Implement the vision call. Verify with a unit test using a mocked `fetch` (valid JSON, a 5xx then success, and a timeout).
  - Meta Responses API (`{META_API_BASE_URL}/responses`, model `META_VISION_MODEL`, default `muse-spark-1.3`), with the image sent as an `input_image` base64 data URL.
  - Strict JSON-schema `text.format`, with zod validation of the output and one retry on invalid JSON.
  - 30 s timeout and one retry on 5xx.
  - A transcription-only prompt that omits buyer fields.
- [ ] 3.2 Record the demo fixtures: photograph one real receipt from each chain, run it through the live adapter once, and save the reviewed extraction under `apps/web/fixtures/receipts/` with the image's SHA-256. Then add the fixture path: when there's no key, or the call fails, and `DEMO_RECEIPTS=1`, match the image SHA-256 against the recorded extractions in `apps/web/fixtures/receipts/` (one sample each for D1, Jumbo and Éxito) and flag the result `demo: true`. Otherwise return "Leer facturas no está disponible por ahora." Verify with tests for both branches.
- [x] 3.3 Implement `chooseCandidate(lineText, candidates)`: the model returns one of the given ids or none, and any other id is rejected. Verify with a test where the mocked model returns an unknown id and the result is "none".

## 4. Receipt API

- [x] 4.1 Implement `POST /api/receipts` (multipart, ≤10 MB). It stores the image, extracts, parses, scrubs and runs the checks; rejects a suspended session, an already-accepted image hash (before calling the model), unsupported stores, an illegible invoice number, dates in the future or older than 72 h, a match on any duplicate layer against confirmed receipts, and a 6th receipt that day for the session; records each duplicate rejection; then saves a draft. Verify with route tests for each rejection message in the spec and one draft success using a demo fixture.
- [x] 4.2 Implement line matching in priority order: EAN, then store-internal code, then `ReceiptAlias`, then snapshot search with expanded abbreviations plus `chooseCandidate`. Produce lines map to `ProduceItem` and a per-store synthetic listing (`produce:<slug>:<unit>`). Verify with tests: an EAN line matches without the model, "ARZ DIANA 1KG" proposes Arroz Diana, and "BANANO URABA 0,845 KG x 3.980" maps to `produce:banano:kg` at 3.980 per kg.
- [x] 4.3 Implement `POST /api/receipts/:id/confirm`. It applies line edits and exclusions (ignoring any header fields sent by the client), re-runs the checks and the duplicate layers, maps a unique-index violation on commit to "Esta factura ya fue registrada.", writes the confirmed and matched lines as `community:receipt` observations (observedAt = purchase time, `receiptLineId` set), refreshes the aliases, and writes reward events, all in one transaction. Verify with an integration test against the local database: 9 accepted lines out of 12 give 9 observations and 90 points, and confirming a duplicate is rejected with no new rows.
- [x] 4.4 Add the duplicate guardrail tests. Verify each with a route or integration test against the local database:
  - Same receipt from another session is rejected at the draft stage.
  - Exact same file is rejected without calling the mocked model.
  - A retake with a misread invoice number but the same header fingerprint is rejected.
  - Two concurrent confirms of the same receipt end with exactly one accepted receipt and one set of observations and points.
  - A third duplicate in 24 h suspends the session, and the next upload gets the pause message.
- [x] 4.5 Add a worker job that deletes drafts after 24 h and receipt images after 30 days. Verify with a test that backdates the rows and checks they are removed.

## 5. Community prices in search, modal and planner

- [x] 5.1 Extend the `Offer` contract with `source: "online" | "receipt"` and `branch?`. Online reads exclude `community:%`; add community reads with a 72 h window. Verify with a test that an 80 h receipt observation is not returned and that online-only callers see no community rows.
- [x] 5.2 In `compare.ts`, group produce by `produce:<slug>:<unit>` and keep the cheapest offer per store and source. Show kg and unit groups of one item together with no cross-unit verdict. Verify with a test that Banano per kg at D1 and Jumbo gets a verdict, and Banano per unit at D1 against per kg at Jumbo does not.
- [x] 5.3 In `candidates.ts`, add receipt candidates (`priceStatus: "reported"`) only for (item, store) pairs with no acceptable online candidate. `verify.ts` skips them, and the line reason reads "Precio reportado en factura hace N h; no verificado en línea". Verify with tests for both planner scenarios in the spec (produce from a receipt, and online wins).
- [x] 5.4 On mobile, render receipt prices in `StorePrices` and the product modal: a full row labeled "Reportado en tienda · factura · hace X h" when the store has no online price, or a sub-line "En tienda: …" under the online row. Verify in a web-export screenshot with a seeded receipt.

## 6. Rewards

- [x] 6.1 Implement point rules: 10 per accepted line, plus 15 for a gap or produce line (at most one bonus per line), decided inside the confirm transaction. Verify with a test where a first Éxito price earns 25 and is labeled "Primer precio en Éxito".
- [x] 6.2 Implement the badges (Primera factura, Cazador de frutas, Pionero, Constante), granted once from ledger counts. Verify with tests at each threshold, including no second grant.
- [x] 6.3 Implement `GET /api/rewards/me` (balance, badges, history, own rank) and `GET /api/rewards/leaderboard?zone=` (current week in America/Bogota, top 10 plus own position, display name or "Vecino #id"). Verify with a test seeded across a Sunday-to-Monday boundary.
- [x] 6.4 Implement revocation: negative ledger events and badge re-evaluation. Implement contributor merging (sum the ledgers, keep the earliest badge) for the future sign-in hook. Verify with tests for "Factura duplicada: −120" and a merge of 340 points.

## 7. Mobile flow (`apps/mobile`)

- [x] 7.1 Persist the anonymous session UUID in AsyncStorage and use it for every API call (replacing the per-launch UUID in `lib/planner.ts`). Verify that the same id is sent after reloading the web export.
- [ ] 7.2 Add the "Escanear factura" entry points in Explorar (the header and the end of search results) and in Perfil. The camera or library goes through `expo-image-picker` (quality 0.7), with an upload progress state and a "Probar con una factura de ejemplo" button when the API reports demo mode. Verify with a screenshot of each entry point.
- [ ] 7.3 Build the review screen:
  - A read-only header (store, branch, date, total, invoice number) with "Tomar la foto de nuevo".
  - Editable lines with the check status ("Revisa este precio", "Los números no cuadran") recomputed on each edit by the shared core module.
  - Match chips with "Cambiar producto" and "No está en la lista".
  - Exclude toggles.
  - The reconciliation banner.
  - The demo label.

  Verify with screenshots of a clean receipt and of one with a failing line.
- [ ] 7.4 Build the confirmation screen ("+90 puntos" with breakdown, gap labels, newly earned badges). Verify with a screenshot after confirming the demo receipt.
- [ ] 7.5 In Perfil, add the rewards section: balance, badges, weekly neighborhood ranking with own position, an editable display name, and the line "Los puntos no tienen valor en dinero". Verify with a screenshot.

## 8. End-to-end and demo

- [ ] 8.1 Run the demo end to end with no API key: scan the sample Jumbo receipt, review, confirm, then search "banano" and see the Jumbo per-kg receipt price beside the other stores. Then build a plan with "1 kg banano" that uses the receipt price with its label. Record the steps and screenshots in `docs/demo-receipts.md`.
- [ ] 8.2 When the Meta key is available, run one real receipt from each chain and note the extraction accuracy (lines read correctly or needing correction) in `docs/demo-receipts.md`.
