# Spec Delta

## Purpose

Lets a shopper send Rinde the DIAN electronic invoice (factura electrónica) that D1, Jumbo or Éxito emailed them, by forwarding the email to a personal address or uploading the file, so its exact prices become a reviewable receipt without a vision model reading a photo.

## ADDED Requirements

### Requirement: Personal forwarding address
The system SHALL give each contributor one forwarding address on the inbound email domain, unique to them and not derived from their email, name or session id. The app SHALL show the address with a one-tap copy action and the instruction "Reenvía aquí el correo de tu factura electrónica". The address SHALL work without an account. When an anonymous contributor signs in and their device is linked to the account, invoices sent to either the device's address or the account's address SHALL reach the same contributor. The contributor SHALL be able to replace their address with a new one, after which the old address stops accepting invoices.

#### Scenario: Address shown and copied
- **WHEN** the user opens the receipt screen
- **THEN** the screen shows their forwarding address and a "Copiar" action that copies it to the clipboard and confirms "Dirección copiada"

#### Scenario: Works without an account
- **WHEN** an anonymous user forwards an invoice email to the address shown on their device
- **THEN** the invoice is attributed to that device's contributor

#### Scenario: Replacing a leaked address
- **WHEN** the user chooses "Cambiar dirección"
- **THEN** a new address is shown and emails sent afterwards to the old address are not processed

### Requirement: Forwarded email intake
The system SHALL accept inbound emails only through the email provider's webhook with a valid signature, and SHALL ignore requests whose signature is missing or invalid. It SHALL find the contributor from the recipient address; an email to an unknown or replaced address SHALL be dropped without processing its attachments. The system SHALL look for invoice attachments in the email: a `.zip` containing the DIAN XML (and usually its PDF), a bare `.xml`, or a `.pdf`. When an email carries several invoices, each SHALL be processed on its own. Any email processed for a contributor SHALL produce an intake record with its outcome (see "Intake outcomes are reported").

#### Scenario: Forwarded zip
- **WHEN** a contributor forwards the store's email with `089090060802126QZ9667377.zip` attached to their address
- **THEN** the system opens the zip, reads the invoice XML and creates a receipt draft for review

#### Scenario: Unsigned webhook
- **WHEN** a request reaches the inbound endpoint without a valid provider signature
- **THEN** the system rejects it and creates no intake record

#### Scenario: Email without an invoice
- **WHEN** an email to a valid address has no zip, XML or PDF attachment
- **THEN** the intake is recorded as rejected with "No encontramos la factura electrónica en el correo. Reenvía el correo que trae el archivo .zip."

### Requirement: Direct upload
The receipt screen SHALL offer "Subir factura electrónica", accepting a `.zip`, `.xml` or `.pdf` file of at most 10 MB. An uploaded file SHALL go through the same checks and produce the same result as the same file arriving by email, except that the outcome is shown immediately on screen.

#### Scenario: Uploading the zip
- **WHEN** the user uploads the invoice `.zip` from their phone's files
- **THEN** the review screen opens with the invoice's lines

#### Scenario: Unsupported file
- **WHEN** the user uploads a `.docx`
- **THEN** the upload is refused with "Sube el archivo .zip, .xml o .pdf de tu factura electrónica."

### Requirement: Attachments are opened safely
The system SHALL treat every attachment as untrusted. It SHALL refuse an attachment over 10 MB, a zip with more than 20 entries or whose entries expand beyond 20 MB in total, and any entry that is not an `.xml` or `.pdf`; nested archives SHALL NOT be opened. XML SHALL be parsed without resolving external entities or expanding entity declarations. Attachments SHALL be processed in memory and never written to disk under a name taken from the archive.

#### Scenario: Zip bomb
- **WHEN** a zip's entries would expand to 2 GB
- **THEN** the system stops reading it and records "No pudimos abrir el archivo de la factura."

#### Scenario: XML with an external entity
- **WHEN** an XML attachment declares an external entity pointing to a local file
- **THEN** the entity is not resolved and the document is rejected as not a valid invoice

### Requirement: Reading the DIAN electronic invoice
The system SHALL accept a DIAN `AttachedDocument` that embeds a UBL 2.1 `Invoice` with invoice type code `01` (factura electrónica de venta), or a bare UBL `Invoice` of that type. It SHALL reject credit notes, debit notes and other document types with "Este documento no es una factura de compra." From the invoice it SHALL read the supplier NIT and commercial (banner) name, the branch address, the issue date and time with its offset, the invoice number (prefix and consecutive), the CUFE, the currency, the payable total, and for each invoice line the description as issued, the store's item code, the quantity with its unit, the line amount, the line's taxes and any line discount. Every price SHALL come from these amounts; none SHALL be estimated, rounded from another source or produced by a model.

#### Scenario: Line price includes its tax
- **WHEN** a line has quantity 1, line amount 7.226,89 and IVA 1.373,11
- **THEN** the draft line shows a unit price of $8.600 and a line total of $8.600

#### Scenario: Weighed line
- **WHEN** a line has quantity 0,845 in kilograms and line amount plus tax of 3.363
- **THEN** the draft line shows 0,845 kg, a unit price of $3.980 per kg and a line total of $3.363

#### Scenario: Line discount
- **WHEN** a line carries a discount (allowance) of 1.000
- **THEN** the draft shows the line's price before the discount and a discount line of −$1.000 tied to it

#### Scenario: Credit note
- **WHEN** the attachment is an `AttachedDocument` embedding a `CreditNote`
- **THEN** the intake is rejected with "Este documento no es una factura de compra."

#### Scenario: Totals reconcile
- **WHEN** the lines' totals, after discounts, add up to the payable amount within the invoice's rounding amount
- **THEN** the draft shows no difference; otherwise the review shows the difference as for a photographed receipt

### Requirement: Only DIAN-validated invoices are accepted
The system SHALL require that an `AttachedDocument` include the DIAN validation response for the invoice, with a result indicating the document was validated, and that the response refers to the same CUFE as the invoice. A bare `Invoice` XML (uploaded without its `AttachedDocument`) SHALL be accepted only if its CUFE is well formed (96 hexadecimal characters) and SHALL be marked as not DIAN-confirmed on the receipt. Documents failing these checks SHALL be rejected with "No pudimos validar esta factura electrónica."

#### Scenario: Validated invoice
- **WHEN** the `AttachedDocument` contains an `ApplicationResponse` reading "Documento validado por la DIAN" for the invoice's CUFE
- **THEN** the invoice is accepted and its receipt is marked DIAN-confirmed

#### Scenario: Mismatched validation
- **WHEN** the `ApplicationResponse` refers to a different CUFE than the embedded invoice
- **THEN** the intake is rejected with "No pudimos validar esta factura electrónica."

### Requirement: Store and banner acceptance
The system SHALL accept an invoice only when its supplier NIT belongs to the company that operates D1, Jumbo or Éxito **and** its commercial name or branch identifies that banner. Invoices from other banners of the same companies (for example Carulla, Surtimax, Super Inter or Metro) and from any other supplier SHALL be rejected with "Por ahora leemos facturas de D1, Jumbo y Éxito." and SHALL award no points.

#### Scenario: Éxito banner
- **WHEN** an invoice has supplier NIT 890900608 and commercial name "ÉXITO LAURELES"
- **THEN** the invoice is accepted as an Éxito receipt with branch "ÉXITO LAURELES"

#### Scenario: Carulla under the same company
- **WHEN** an invoice has supplier NIT 890900608 and commercial name "CARULLA EXPRESS EDS EL RETIRO"
- **THEN** the intake is rejected with "Por ahora leemos facturas de D1, Jumbo y Éxito."

### Requirement: PDF-only fallback
When the only invoice file is a PDF, the system SHALL read the PDF's pages through the same extraction used for receipt photos, under all of that extraction's rules (prices transcribed from the document, never invented; illegible values left empty; line and total checks; review). The receipt SHALL be marked as read from a PDF. When the vision model is unavailable, the intake SHALL be rejected with "No pudimos leer el PDF. Reenvía el correo con el archivo .zip de la factura."

#### Scenario: Email with only the PDF
- **WHEN** a forwarded email has `fv….pdf` and no XML
- **THEN** a draft is created from the PDF's content and every line awaits review as for a photo

### Requirement: E-invoices become reviewable drafts under the receipt rules
An accepted invoice SHALL become a receipt draft for the contributor, matched to catalog listings of its store in the same way as a photographed receipt (the item code first, then the description), and SHALL follow the same rules: duplicates are refused (the CUFE and the store plus invoice number identify the invoice, whichever way it arrives, including a photo of the same purchase), and one invoice belongs to one contributor only: while one contributor's draft of it awaits review (for up to 24 hours), the same invoice from anyone else is refused as a duplicate, even if they send it at the same moment; the sender can still send it again themselves, the purchase must be within 72 hours and not in the future, at most 5 confirmed receipts per contributor per day, and a paused contributor cannot submit. The header (store, branch, date and time, total, invoice number, CUFE) SHALL be read-only. Lines read from the XML SHALL start as passing the line check; the user SHALL still review the product matches and confirm before any price is stored or points are awarded. Points SHALL follow the existing rewards rules.

#### Scenario: Same purchase sent twice
- **WHEN** a contributor forwards an invoice whose CUFE matches a confirmed receipt (sent earlier by email, upload, or read from a photo with the CUFE printed)
- **THEN** the intake is rejected with "Esta factura ya fue registrada." and counts as a duplicate attempt

#### Scenario: Someone else already sent it
- **WHEN** contributor A forwards an invoice and, before A confirms the draft, contributor B uploads the same invoice
- **THEN** B's intake is rejected with "Esta factura ya fue registrada." and A's draft is unaffected

#### Scenario: Unreviewed hold lapses
- **WHEN** A's draft of an invoice has waited more than 24 hours without being confirmed
- **THEN** the hold is released and another contributor can send the same invoice

#### Scenario: Invoice older than 72 hours
- **WHEN** a contributor forwards an invoice issued four days ago
- **THEN** the intake is rejected with "Esta factura tiene más de 3 días; sus precios ya no sirven para comparar."

#### Scenario: Confirming an e-invoice
- **WHEN** the user reviews an e-invoice draft, fixes one product match and confirms
- **THEN** the confirmed lines become community prices labeled as from an invoice and points are awarded as for a photographed receipt

### Requirement: Intake outcomes are reported
The app SHALL list the contributor's invoices received by email that await review, newest first, each opening its review screen, and the outcome of their recent intakes from the last 7 days (accepted, or the rejection message). When an email is processed and outbound email is configured, the system SHALL reply to the sender with the outcome: for an accepted invoice, a link that opens its review in the app; for a rejection, the rejection message. Replies SHALL never include prices, totals or line contents. The system SHALL send at most one reply per inbound email and none for dropped emails.

#### Scenario: Waiting for review
- **WHEN** an invoice arrived by email and the user opens the receipt screen
- **THEN** it shows "Facturas por revisar" with the store, date and number of lines, and tapping it opens the review

#### Scenario: Rejected by email
- **WHEN** a forwarded Carulla invoice is rejected
- **THEN** the receipt screen lists it with "Por ahora leemos facturas de D1, Jumbo y Éxito." and, if email sending is configured, the sender receives that message by reply

### Requirement: Intake limits
The system SHALL process at most 20 inbound emails per forwarding address per day and SHALL drop further emails to that address until the next day, recording a single rejection "Recibimos demasiados correos en esta dirección hoy." for that day.

#### Scenario: Flooded address
- **WHEN** a forwarding address receives its 21st email of the day
- **THEN** the email is not processed and the receipt screen shows the limit message once

### Requirement: Invoice files and personal data are not kept
The system SHALL NOT store the inbound email body, the attachments, or any buyer data from the invoice (name, document number, email, address, phone, or the QR's buyer field). It SHALL keep only the store data, purchase data, lines, the CUFE, and hashes of the attachments for duplicate detection. Attachments SHALL be discarded once the intake finishes, whether it succeeded or failed.

#### Scenario: Stored receipt from an e-invoice
- **WHEN** an e-invoice draft is created
- **THEN** the stored receipt contains no buyer name, document number or email, and no copy of the zip, XML or PDF exists on the server
