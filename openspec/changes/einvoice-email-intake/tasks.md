# Tasks

## 1. Fixtures and dependencies

- [x] 1.1 Add test fixtures under `packages/core/src/einvoice/fixtures/`, built from the sample `089090060802126QZ9667377.zip` with the buyer's name, document number, email, address and the QR `DocAdq` replaced by placeholders: the Carulla original (a rejection case), an Éxito-banner variant (PartyName "ÉXITO LAURELES"), a variant with a weighed `KGM` line and a line allowance, a `CreditNote` variant, a variant whose `ApplicationResponse` CUFE differs, and an XML with a `<!DOCTYPE>`/external entity. Verify with `grep` that no fixture contains the real buyer data.
- [x] 1.2 Add `fflate` and `fast-xml-parser` to `packages/core`, and `svix` to `apps/web` (pnpm). Verify `pnpm install` and `turbo run typecheck` pass and the web Docker image still builds.

## 2. Parsing the DIAN invoice (packages/core)

- [x] 2.1 Implement `openInvoiceFiles(bytes, name)`: a zip read in memory with the limits from the design (10 MB compressed, 20 entries, 20 MB inflated with an output cap, only `.xml`/`.pdf`, no nested zips), or a bare XML/PDF passthrough. Verify with unit tests for the sample zip, a zip bomb, too many entries, a nested zip and a `.docx`.
- [x] 2.2 Implement `parseDianDocument(xml)`: reject `<!DOCTYPE`, parse the `AttachedDocument`, parse each CDATA document, classify `Invoice`/`CreditNote`/`DebitNote`/`ApplicationResponse`, validate with zod, and return the invoice header (supplier NIT and banner, branch, issue date and time with offset, number, CUFE, currency, payable and rounding amounts), the lines (description, item code and scheme, quantity, unit code, line amount, tax, allowances) and `dianConfirmed` (validation result with a matching CUFE). Verify with unit tests on every fixture, including the credit note, the mismatched CUFE and the external-entity cases.
- [x] 2.3 Implement `invoiceToReceiptInput(doc)`: line total = line amount + taxes, the unit price derived when quantity ≠ 1, unit-code mapping, discount lines from allowances, reconciliation against the payable amount within the rounding, and buyer data never copied. Verify the "line price includes its tax" (7.226,89 + 1.373,11 → 8.600), weighed and discount scenarios as unit tests.
- [x] 2.4 Implement the store and banner table (NIT without its check digit → allowed and rejected banner patterns, accent-insensitive). Verify with tests that the Éxito banner is accepted, Carulla/Surtimax/Super Inter and Metro are rejected, and unknown NITs are rejected.

## 3. Data model

- [x] 3.1 Prisma migration: `ForwardingAddress` (token unique, contributor, active, daily counter), `InvoiceIntake` (via, `resendEmailId` unique, status, message, receiptId, results JSON, indexed by contributor and date), and `Receipt.source` (default `photo`) plus `Receipt.dianConfirmed`. Verify the migration applies to the local DB and `prisma generate` and typecheck pass.
- [x] 3.2 Make `mergeContributors` re-point forwarding addresses and intakes to the account contributor. Verify with an extended `account.int.test.ts` case where both addresses resolve to the merged contributor.

## 4. Shared draft pipeline (apps/web)

- [x] 4.1 Split `createDraft` into the photo front end and a shared `draftFromInput(contributor, input)` (pause, daily cap, validity window, duplicate layers, matching, persistence with `source`/`dianConfirmed`). Verify that all existing receipt unit and integration tests still pass unchanged.
- [x] 4.2 Implement `intakeInvoiceFiles({ contributor, files, via })`: open the files, prefer the XML over the PDF for the same invoice, check banner and validation, build the `ReceiptInput`, call `draftFromInput`, and map every failure to the spec's messages; buyer data is never persisted and the files are dropped afterwards. Verify with integration tests: the Éxito fixture yields a draft whose lines pass their checks; Carulla, the credit note, the mismatched CUFE, an old invoice and a duplicate CUFE (including against a confirmed photo receipt carrying the same CUFE) each get the exact spec message.
- [x] 4.3 Implement the PDF fallback: render up to 4 pages to PNG (lazy-loaded WASM renderer) and run the photo extraction with `source: "einvoice-pdf"`, with the spec's message when the renderer or Muse is unavailable. Verify with a test using the Muse mock, and once manually against the real Muse with the sample PDF.
- [x] 4.4 Make confirmed e-invoice lines produce the same observations and points as photos, with provenance labeled "factura electrónica". Verify with an integration test that confirms an e-invoice draft and checks the observations, the rewards and the source label.

## 5. API routes

- [ ] 5.1 `POST /api/receipts/einvoice`: multipart upload with `x-rinde-session`, 10 MB cap, `.zip`/`.xml`/`.pdf` only, returns the draft or `{ error, code }`. Verify with an integration test through the route handler, and that the upload goes through the CORS proxy (body size within `proxyClientMaxBodySize`).
- [ ] 5.2 `GET /api/receipts/inbox` (creates the forwarding address lazily; returns the address, or null when inbound is not configured, plus drafts awaiting review and the last 7 days of outcomes), `POST /api/receipts/inbox/address` (rotate), and `GET /api/receipts/:id` for opening a draft from a link (the session must own it). Verify with integration tests covering lazy creation, rotation deactivating the old token, and another session being refused.
- [ ] 5.3 `POST /api/inbound/email`: Svix signature check on the raw body, an idempotent `InvoiceIntake` on `resendEmailId`, a quick 200 and processing in `after()` (recipient → address via `facturas+<token>@` or `<token>@`; unknown/inactive → dropped; 20/day cap; list and download attachments with a size cap; intake per invoice file; outcome recorded). Verify with tests: an unsigned request gets 401 and no row; a replayed event creates one intake; an unknown address is dropped without any attachment download; the 21st email of the day is dropped with a single limit message (Resend API mocked).
- [ ] 5.4 Reply email with the outcome when `RESEND_API_KEY`/`EMAIL_FROM` are set (accepted: link to `/receipt?draft=<id>`; rejected: the message; never prices or lines; at most one per inbound email). Verify with a unit test on the message content and that no reply is sent for dropped emails.
- [ ] 5.5 Worker job: retry intakes stuck in `received` for more than 10 minutes by re-listing the Resend attachments. Verify with a worker test that a stale intake is processed once.

## 6. Mobile app

- [ ] 6.1 Add `expo-document-picker` and `expo-clipboard` with `npx expo install` (after reading their SDK 58 docs), and the inbox/upload client in `lib/receipts.ts`. Verify with `npx tsc --noEmit`.
- [ ] 6.2 Receipt screen start state: a "Facturas por revisar" list (store, date, line count; opens review) and a "¿Te llegó la factura por correo?" card with the address, "Copiar" ("Dirección copiada"), "Cambiar dirección" and "Subir factura electrónica"; hidden address card when inbound is off. Verify with screenshots at 390 px in light and dark mode.
- [ ] 6.3 Review screen for e-invoices: header "Factura electrónica · validada por la DIAN" (or "no confirmada por la DIAN" for a bare XML), no "Tomar la foto de nuevo", and `/receipt?draft=<id>` opens a draft from a reply link, with the spec's message on a device that doesn't own it. Verify end to end on the web build: upload the Éxito fixture → review → confirm → points shown.
- [ ] 6.4 Recent outcomes list (last 7 days) on the receipt screen showing rejection messages. Verify by forwarding the Carulla sample and checking that its message appears.

## 7. Configuration, deploy and end-to-end check

- [ ] 7.1 Gate the inbound route and the forwarding card on `RESEND_WEBHOOK_SECRET` and `INBOUND_EMAIL_DOMAIN`; document the env vars in `.env.example` and `docker-compose.yml`. Verify that with the vars unset the route returns 404, `address` is null and the upload still works.
- [ ] 7.2 Set up Resend receiving on the managed `<id>.resend.app` domain, register the webhook to the production API, add the env vars to Coolify and deploy. Verify by forwarding the real sample email from a phone to a personal address and checking that the app shows the Carulla rejection, then that an Éxito invoice becomes a draft.
- [ ] 7.3 Confirm the D1 and Jumbo NITs and banner names with one real e-invoice of each and add them as scrubbed fixtures. Verify with the store-table tests and one end-to-end forward per store.
