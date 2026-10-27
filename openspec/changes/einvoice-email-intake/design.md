# Design

## Context

See proposal.md for the why. Relevant current state:

- **Receipts today** (`apps/web/src/server/receipts.ts`): `createDraft` takes photos, has Meta Muse transcribe them into an `Extraction` (strings), scrubs personal data, runs `detectStore`/`normalizeInvoiceNumber`/`parseReceiptDate`, applies the duplicate layers (`imageHash`, store + invoice number, `cufe`, header fingerprint), the 72-hour window, the daily cap and pauses, then `parseLines` → `matchLines` → `Receipt` + `ReceiptLine` rows. `confirmDraft` turns reviewed lines into `PriceObservation`s (`community:receipt`) and points. All of this is keyed by the device's `x-rinde-session` → `Contributor`. `linkDevice` merges a device contributor into the account's on sign-in (`mergeContributors`).
- **Email**: `apps/web/src/server/email.ts` sends one-time codes through Resend's HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` are set; production has neither yet. Nothing receives email.
- **The sample** (`089090060802126QZ9667377.zip`): `ad…xml` is a DIAN `AttachedDocument` whose `cac:Attachment/…/cbc:Description` CDATA holds the UBL `Invoice` (ProfileID "DIAN 2.1: Factura Electrónica de Venta", `InvoiceTypeCode` 01, CUFE-SHA384 `cbc:UUID`, supplier `ALMACENES ÉXITO S.A` NIT 890900608 with `PartyName` "CARULLA EXPRESS EDS EL RETIRO", lines with `InvoicedQuantity unitCode="94"`, `LineExtensionAmount`, a per-line `TaxTotal` (IVA), `StandardItemIdentification schemeID="999"` = the chain's internal item code, `LegalMonetaryTotal/PayableAmount` 16100.00), and a second CDATA with the DIAN `ApplicationResponse` (ResponseCode 02, "Documento validado por la DIAN"). The `fv…pdf` is a rendered page without a usable text layer. The invoice includes the buyer's name and document number (`AccountingCustomerParty`, and `DocAdq` in the QR string).

## Goals / Non-Goals

**Goals:**
- Accept DIAN e-invoices from email and upload through one server path that yields the same `ReceiptDraft` the review screen already renders.
- Keep every existing receipt rule (duplicates, validity, caps, review, rewards, provenance) in force with no duplicate implementation.
- Never persist attachments or buyer data.
- Work end to end on Resend's managed `<id>.resend.app` domain so it can be demoed before a custom domain's MX is set up.

**Non-Goals:**
- Cryptographic verification of the XAdES signature or online lookup of the CUFE on the DIAN portal (see Risks).
- Credit/debit notes, invoices from stores outside D1/Jumbo/Éxito, or e-invoices that arrive only as a download link in the email body.
- Auto-confirming invoices without user review, and push notifications.
- Reading invoices from a connected mailbox (Gmail OAuth etc.); the user forwards.

## Decisions

### 1. One intake pipeline, two doors
`POST /api/inbound/email` (Resend webhook) and `POST /api/receipts/einvoice` (multipart upload with `x-rinde-session`) both call `intakeInvoiceFiles({ contributor, files, via })`. It returns either a draft or a `ReceiptRejected`; the upload route returns that synchronously, the webhook records it on an `InvoiceIntake` row (and optionally replies). This keeps the behavior identical by construction, which the spec requires ("same checks and result").
*Alternative:* have the app upload by sending an email to itself — needless latency and depends on outbound mail.

### 2. Split `createDraft` at the extraction boundary
Refactor `createDraft` into: (a) the photo front end (hash, Muse, scrub, header parsing) producing a normalized `ReceiptInput { store, branch, purchasedAt, total, invoiceNumber, cufe, lines: ParsedLine[], source, demo, fileHash }`, and (b) a shared `draftFromInput(contributor, input)` that runs pause/cap/validity/duplicate checks, matching and persistence. The e-invoice front end produces the same `ReceiptInput` directly from XML. Lines built from XML get exact numbers, so `checkLine` passes them unless the document itself is inconsistent.
*Alternative:* converting the XML into a fake Muse `Extraction` of strings and reusing `createDraft` as is — loses precision (decimal quantities, tax split) and couples XML parsing to string formats meant for OCR.

### 3. Prices from the XML: line amount + line taxes
UBL `LineExtensionAmount` is pre-tax (sample: 7226.89 + IVA 1373.11 = 8600, the shelf price). Per line: `total = round(LineExtensionAmount + Σ line TaxTotal/TaxAmount)` in pesos, `unitPrice = round(total / quantity)` with `priceDerived` set when quantity ≠ 1 (same flag photos use), line-level `AllowanceCharge` with `ChargeIndicator=false` becomes a `discount` line tied to it (amount plus the tax share, when the tax is computed after the allowance the XML already reflects it in `TaxTotal`). Units: `94`/`NIU`/`EA`/`H87` → unit, `KGM` → kg, `GRM` → g, `LTR` → l, `MLT` → ml; anything else → unit with the raw code kept on the line text. Reconcile against `PayableAmount` allowing `PayableRoundingAmount` + 1 peso per line. Item code: `StandardItemIdentification/ID` (scheme `010` is a GTIN, `999` a store code) feeds `matchLines`' code step unchanged; `SellersItemIdentification` is the fallback.

### 4. XML parsing without entity expansion
Use `fast-xml-parser` (no DTD/entity resolution; `processEntities: false`, reject documents containing `<!DOCTYPE`) with `removeNSPrefix`, then a zod schema over the fields we read so any shape surprise fails closed as "No pudimos validar esta factura electrónica." The `AttachedDocument` is parsed first; each `cbc:Description` CDATA is parsed as its own document and classified by root (`Invoice`, `CreditNote`, `DebitNote`, `ApplicationResponse`). A bare `Invoice` root is accepted too (spec: not DIAN-confirmed).
*Alternative:* `xmldom`/`libxmljs` — heavier, and libxml needs native builds in the Docker image.

### 5. Zip handling in memory with hard limits
`fflate`'s `unzipSync` with a `filter` callback that inspects each entry's declared `originalSize` and name before inflating: stop at 20 entries, 20 MB total declared size, only `*.xml`/`*.pdf`, no nested zips, names used only for classification (`ad*`/`fv*` hints) and never as paths. Declared sizes can lie, so inflation also runs with an output cap (stream inflate and abort past the budget). 10 MB cap on the compressed attachment before anything is read.

### 6. Store and banner from NIT + commercial name
A table in `packages/core` maps NIT → company → allowed banner patterns: `890900608` (Almacenes Éxito, confirmed by the sample) → `/\bEXITO\b/` (rejecting `CARULLA|SURTIMAX|SUPER ?INTER|SURTI ?MAYORISTA`); `900155107` (Cencosud Colombia, from public records) → `/\bJUMBO\b/` (rejecting `METRO|EASY|SPID`); `900276962` (Koba Colombia, operator of D1, from public records) → any banner. The NIT is compared without its check digit. The banner text is `PartyName/Name` falling back to the branch line; matching is accent-insensitive. The Cencosud and Koba entries are confirmed against the first real invoice of each and that invoice becomes a test fixture; a NIT that turns out wrong only causes a rejection (fail closed), never a mislabeled store.

### 7. Forwarding addresses as their own table
`ForwardingAddress { id, token (10 chars, lowercase base32, unique), contributorId, active, createdAt, emailsToday, countedOn }`. Address = `facturas+<token>@INBOUND_EMAIL_DOMAIN` (with the managed Resend domain the local part can be just `<token>`; the parser accepts both forms). Created lazily on first `GET /api/receipts/inbox`. Rotation sets `active=false` and creates a new row. `mergeContributors` re-points the device's rows to the account contributor, so both addresses keep working after sign-in. The token is random (`crypto.randomBytes`), not derived from session or email.
*Alternative:* a token column on `Contributor` — a merge would lose one of the two addresses.

### 8. Resend webhook flow
Verify the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`, `RESEND_WEBHOOK_SECRET`) over the raw body; reject otherwise. Respond `200` quickly after recording an `InvoiceIntake { status: "received", resendEmailId }` (unique on `resendEmailId` so Resend retries are idempotent), then process in the same request with `after()` from `next/server`. Processing: resolve recipient → address (unknown/inactive → mark `dropped`, stop), enforce the 20/day counter, list attachments via the Receiving API, download each `download_url` (valid 1 h) with a size cap, run the pipeline per invoice file, set the intake's outcome. One intake row per inbound email; when an email holds several invoices, child outcomes are stored on the row as a small JSON list.
*Alternative:* polling Resend — slower and needs a scheduler; the worker app could host it but webhooks are simpler.

### 9. PDF fallback through Muse
Render each PDF page (max 4) to PNG with a WASM renderer (`mupdf` npm, no native deps; fits the alpine image) at ~150 dpi and pass them to the existing `extractReceipt(images)` as a multi-part receipt. Everything after is the photo path (`source: "einvoice-pdf"`). If the renderer or Muse fails → the spec's rejection message.
*Alternative:* sending the PDF to Muse directly — not confirmed supported by the Responses API we use; can replace the renderer later without spec change.

### 10. Data model additions
- `Receipt.source String @default("photo")` — `photo | einvoice | einvoice-pdf`; `Receipt.dianConfirmed Boolean @default(false)`; `imageHash` is reused as the file hash (sha256 of the XML for e-invoices) so the existing "same file" duplicate layer applies.
- `InvoiceIntake { id, contributorId, addressId?, via: "email"|"upload", resendEmailId? @unique, status: received|accepted|rejected|dropped, message?, receiptId?, results Json?, createdAt }`, indexed by `(contributorId, createdAt)`.
- `PriceObservation.source` stays `community:receipt`; the UI label says "factura electrónica" when the receipt's source is `einvoice`.

### 11. App surfaces
`GET /api/receipts/inbox` → `{ address, drafts: [{ id, store, purchasedAt, lines }], recent: [{ status, message, store?, at }] }`. The receipt screen's start state gets two cards above the camera rules: "Facturas por revisar" (when any) and "¿Te llegó la factura por correo?" with the address, "Copiar" (expo-clipboard; `navigator.clipboard` on web) and "Subir factura electrónica" (expo-document-picker with `.zip,.xml,.pdf` types). The review screen is reused; its header shows "Factura electrónica · validada por la DIAN" and hides "Tomar la foto de nuevo" for e-invoices. A draft opened from the reply link uses `/receipt?draft=<id>` and is fetched with the session header (another device without that session gets "Abre Rinde en el celular donde reenviaste la factura").

## Risks / Trade-offs

- [Forged XML injects false prices or farms points] → the signature isn't verified in this change. Mitigations already in force: review before confirm, 5 receipts/day, duplicates and pauses, gap bonuses only for lines passing checks, receipts revocable. Added: DIAN `ApplicationResponse` must match the CUFE; bare XML is marked not DIAN-confirmed. Follow-up: verify the XAdES signature against the DIAN certificate chain, or look up the CUFE on the DIAN portal, and award gap bonuses only to confirmed invoices.
- [D1/Jumbo NITs taken from public records, banner names vary] → fail closed on any mismatch; confirm with a real invoice of each before the demo; banner patterns covered by tests; the rejection message is the same as for photos so users aren't misled.
- [Forwarded emails mangle attachments (some clients inline or re-encode)] → we read attachments from Resend's parsed list, accept bare XML/PDF too, and the upload door is always available.
- [Store emails that only link to a portal] → out of scope; the "no invoice found" message tells the user to forward the email with the .zip.
- [Webhook processing in `after()` dies on deploy/restart] → intake rows stuck in `received` for >10 min are retried by the worker on its next run (Resend's download URLs can be re-listed for the email id).
- [Address leaks lead to spam or someone else's invoices] → 20/day cap, rotation, invoices still need the owner's review on their device; nothing is published until confirmed.
- [Personal data in transit and logs] → never log email bodies or XML; the scrubber removes buyer fields before anything is stored; attachments are only in memory.
- [Image size on a crowded server] → only pure-JS/WASM deps (`fflate`, `fast-xml-parser`, `svix`, `mupdf`); `mupdf`'s WASM (~10 MB) is the largest and can be lazy-loaded only for the PDF fallback.

## Migration Plan

1. Prisma migration adding `ForwardingAddress`, `InvoiceIntake`, `Receipt.source`, `Receipt.dianConfirmed` (all additive, defaults for existing rows). Deploy runs it via the `migrate` service.
2. Ship the API with the inbound route disabled unless `RESEND_WEBHOOK_SECRET` and `INBOUND_EMAIL_DOMAIN` are set (inbox endpoint then returns `address: null` and the app hides the forwarding card; upload still works).
3. In Resend: enable receiving (managed domain first), add the webhook `https://rinde-api.cool.chuventures.com/api/inbound/email` for `email.received`, put the secret and domain into the Coolify env, redeploy.
4. Later, a custom domain: add the MX record, switch `INBOUND_EMAIL_DOMAIN`; old managed-domain addresses keep working because the token is matched, not the domain.
Rollback: unset the env vars (route returns 404, app hides the card); the schema additions are harmless to leave.

## Open Questions

- The exact banner names D1 and Jumbo print in `PartyName` on their e-invoices — confirmed with the first real invoice of each (only affects the patterns, which fail closed).
- Whether Éxito's `schemeID="999"` item codes are the same codes the catalog stores (they look like PLUs, not EANs); if not, matching falls back to the description and the alias table learns them on confirm, which the existing flow already does.
