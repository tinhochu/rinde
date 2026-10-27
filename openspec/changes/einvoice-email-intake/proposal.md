# Proposal

## Why

In Colombia every supermarket purchase can be issued as a DIAN electronic invoice and delivered by email as a `.zip` with the signed UBL XML (`ad….xml`) and its PDF (`fv….pdf`). That XML carries the exact store, branch, date, CUFE, totals and every line with its code, quantity and price, validated by the DIAN. Today Rinde can only learn receipt prices from a photo read by a vision model, which needs good light, struggles with long receipts and must be reviewed line by line. Accepting the electronic invoice gives exact prices with no model in the loop, from receipts people already have in their inbox.

## What Changes

- Each contributor gets a personal forwarding address (e.g. `facturas+k7m2q9@<inbound domain>`), shown in the app with a copy button. It works without an account and follows the contributor when they sign in.
- The server receives forwarded emails through Resend Inbound (`email.received` webhook, signature verified), downloads the attachments, and opens the `.zip` safely in memory (size, entry-count and file-type limits; no files written to disk).
- A parser reads the DIAN `AttachedDocument`: the embedded UBL `Invoice` (supplier NIT and banner name, branch address, issue date and time, invoice number, CUFE, totals, and each line's description, store code, quantity, unit and price including line taxes) and the DIAN `ApplicationResponse` (validation result).
- Invoices are accepted only from D1, Jumbo and Éxito banners, identified by supplier NIT **and** banner name. Other banners of the same companies (Carulla, Surtimax, Super Inter, Metro…) are rejected with the existing "Por ahora leemos facturas de D1, Jumbo y Éxito." message.
- A valid invoice becomes a receipt draft in the existing pipeline (catalog matching, duplicate layers with the CUFE, 72-hour window, daily cap, review, confirm, points). Shelf prices are computed from the XML (line amount plus that line's taxes), never by a model.
- When an email carries only the PDF, the PDF page is read through the existing receipt-photo extraction as a fallback, with the usual line checks and review.
- The app gains: "Subir factura electrónica" in the receipt screen (accepts the `.zip`, the `.xml` or the PDF, through the same server path), an inbox of invoices received by email waiting for review, and the outcome of each forwarded email (accepted, or why it was rejected). When email sending is configured, the sender also gets a short reply with the result and a link to review.
- Personal data in the invoice (buyer name, document number, email, the QR's `DocAdq`) is never stored; the attachments are discarded after parsing and only hashes are kept.

## Capabilities

### New Capabilities
- `einvoice-intake`: Receiving DIAN electronic invoices by forwarded email or direct upload, the personal forwarding address, parsing and validating the XML (with the PDF fallback), store/banner acceptance, turning the invoice into a reviewable receipt draft, reporting each intake's outcome, and privacy of the attachments.

### Modified Capabilities
<!-- None: openspec/specs has no archived capabilities yet. The photo receipt capture, community prices and rewards specs live in the in-flight change `receipt-price-rewards`; this change reuses their review, duplicate, validity and reward rules unchanged and states how e-invoices plug into them in its own spec. -->

## Impact

- **API (apps/web):** new `POST /api/inbound/email` (Resend webhook), `POST /api/receipts/einvoice` (upload), `GET /api/receipts/inbox` (drafts and intake outcomes for the session), and the forwarding address on the account/session response. New server modules for zip handling, DIAN XML parsing and inbound email; `receipts.ts` gains a draft path that takes already-structured lines instead of a Muse extraction.
- **Database (packages/db):** a forwarding token on `Contributor`; an `InboundEmail`/intake record (hashes, outcome, message, linked receipt); `Receipt` records its source (`photo` | `einvoice` | `einvoice-pdf`). One migration.
- **Mobile (apps/mobile):** receipt screen gains the upload option and the forwarding address card; an inbox list of invoices to review; the review screen shows e-invoice drafts (header from the DIAN document, read-only).
- **Dependencies:** a zip reader (e.g. `fflate`), an XML parser without entity expansion (e.g. `fast-xml-parser`), Resend webhook verification (`svix`), a PDF-to-image renderer for the fallback.
- **Configuration/ops:** `RESEND_API_KEY` (already planned), `RESEND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN` (a Resend-managed `<id>.resend.app` address works immediately; a custom domain needs an MX record), the webhook URL registered in Resend, and the API's public URL.
- **Risks:** a forged XML could inject false prices; the DIAN XML signature is not cryptographically verified in this change (see design). Store NITs for D1 and Jumbo must be confirmed against real invoices.
