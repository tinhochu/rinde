# Spec Delta

## Purpose

Lets a shopper photograph a D1, Jumbo or Éxito receipt (factura) and turn it, after their review, into a set of confirmed purchase lines with prices read from the receipt itself and never supplied by the model.

## ADDED Requirements

### Requirement: Receipt photo intake
The system SHALL accept one receipt photo per submission, taken with the camera or chosen from the library, in JPEG, PNG or HEIC up to 10 MB. The system SHALL reject a photo whose store cannot be identified as D1, Jumbo or Éxito, with the message "Por ahora leemos facturas de D1, Jumbo y Éxito."

#### Scenario: Supported receipt
- **WHEN** the user submits a clear photo of a Jumbo receipt
- **THEN** the system starts extraction and shows progress until the review screen opens

#### Scenario: Unsupported store
- **WHEN** the user submits a receipt from a store other than D1, Jumbo or Éxito
- **THEN** the system rejects it with "Por ahora leemos facturas de D1, Jumbo y Éxito." and awards no points

### Requirement: Extraction transcribes, never invents
The system SHALL extract the store, branch (when printed), purchase date and time, the receipt total, the invoice number (prefix and consecutive) and the CUFE when printed, and for each line the text as printed, quantity or weight with its unit, unit price, line total, and product code when printed. Every extracted price SHALL be text read from the photo. When a value is not legible, the system SHALL leave it empty and mark the line for review. It SHALL NOT estimate or fill the value from the catalog.

#### Scenario: Illegible price
- **WHEN** a line's unit price is blurred in the photo
- **THEN** that line's unit price is empty, the line is marked "Revisa este precio", and no catalog price is substituted

#### Scenario: Weighed produce line
- **WHEN** a line reads "BANANO URABA 0,845 KG x 3.980 = 3.363"
- **THEN** the line is extracted with weight 0,845 kg, unit price 3.980 per kg and line total 3.363

### Requirement: Arithmetic checks flag misreads
The system SHALL check each line (quantity × unit price equals the line total within 1 peso per unit of rounding) and the receipt (the sum of line totals, after printed discounts, equals the printed total). A line that fails SHALL be marked for review. A receipt whose total does not reconcile SHALL show the difference to the user.

#### Scenario: Line does not add up
- **WHEN** a line reads quantity 2, unit price 4.890, line total 8.780
- **THEN** the line is marked "Los números no cuadran" and cannot be confirmed until corrected or excluded

#### Scenario: Receipt total off
- **WHEN** the lines add up to 52.300 and the printed total is 53.300
- **THEN** the review screen shows "Faltan $1.000 para cuadrar con el total" and the user can still confirm the lines that individually pass

### Requirement: User review before submission
The system SHALL show every extracted line for review before anything is stored as a price. The user SHALL be able to correct quantity, unit price, line total and product match, and exclude any line. The header (store, branch, date and time, total, invoice number, CUFE) SHALL be read-only; when it is wrong, the user can only retake the photo. Only lines that the user confirms and that pass the line check SHALL be submitted.

#### Scenario: Correcting a line
- **WHEN** the user changes a misread unit price from 4.390 to 4.890 so the line check passes
- **THEN** the line becomes confirmable and is submitted with the corrected value, marked as edited by the user

#### Scenario: Header cannot be edited
- **WHEN** the review screen shows a misread receipt total
- **THEN** the total is not editable, and the screen offers "Tomar la foto de nuevo"

#### Scenario: Excluding a line
- **WHEN** the user excludes a line (for example a plastic bag)
- **THEN** that line is not submitted and earns no points

### Requirement: Receipt validity rules
The system SHALL reject a receipt whose purchase date is in the future or more than 72 hours before submission. The system SHALL accept at most 5 receipts per contributor per day.

#### Scenario: Old receipt
- **WHEN** the receipt's date is 4 days ago
- **THEN** the system rejects it with "Esta factura tiene más de 3 días; sus precios ya no sirven para comparar."

#### Scenario: Daily cap
- **WHEN** a contributor submits a sixth receipt on the same day
- **THEN** the system rejects it with "Llegaste al máximo de 5 facturas por hoy." 

### Requirement: Duplicate receipts are never accepted
A receipt SHALL be accepted at most once across all contributors and sessions. The system SHALL treat a submission as a duplicate of an accepted receipt when any of these hold:
- same store and invoice number;
- same CUFE;
- byte-identical photo;
- same store, branch, purchase minute and printed total.

A receipt whose invoice number cannot be read SHALL NOT be accepted. Duplicates SHALL be rejected before extraction when the photo is identical, otherwise at the draft stage, and again at confirmation, so that two concurrent submissions of the same receipt result in exactly one acceptance. A rejected duplicate SHALL earn no points and create no prices.

#### Scenario: Same receipt, another person
- **WHEN** a receipt with Jumbo invoice number "POS 1234-567890" was accepted from one contributor, and another contributor photographs the same receipt
- **THEN** the second submission is rejected with "Esta factura ya fue registrada." before the review screen

#### Scenario: Same photo again
- **WHEN** a contributor uploads the exact same image file a second time
- **THEN** it is rejected immediately, without reading the receipt again

#### Scenario: Invoice number misread on a retake
- **WHEN** a retake of an accepted receipt reads its invoice number differently, but store, branch, minute and total match
- **THEN** the submission is rejected as a duplicate

#### Scenario: Invoice number not legible
- **WHEN** the invoice number cannot be read from the photo
- **THEN** the receipt is not accepted, and the user sees "No pudimos leer el número de la factura. Toma la foto incluyendo la parte de abajo."

#### Scenario: Two people confirm at the same time
- **WHEN** two drafts of the same receipt are confirmed at the same moment
- **THEN** exactly one is accepted, and the other is rejected with "Esta factura ya fue registrada." with no prices or points written

### Requirement: Repeated duplicate attempts suspend scanning
After 3 rejected duplicate submissions from the same session within 24 hours, the system SHALL refuse further receipts from that session for 24 hours with "Pausamos el escaneo de facturas por 24 horas por intentos repetidos.", and every duplicate rejection SHALL be recorded for audit.

#### Scenario: Third duplicate
- **WHEN** a session submits its third duplicate within 24 hours and then tries a new receipt
- **THEN** the new receipt is refused with the pause message, and the three attempts are recorded

### Requirement: Personal data is not kept
The system SHALL NOT extract or store customer names, ID numbers (cédula/NIT of the buyer), card numbers or authorization codes printed on a receipt. The system SHALL delete receipt photos 30 days after submission.

#### Scenario: Receipt with buyer's cédula
- **WHEN** a receipt prints "CC 1.017.xxx.xxx" for the buyer
- **THEN** that value is absent from every stored field and API response

### Requirement: Works without the vision model
When the Meta Model API is not configured or does not respond within 30 seconds, the system SHALL say that reading receipts is unavailable, except in demo mode, where a recorded extraction for a known sample receipt SHALL be used and labeled "Ejemplo de demostración".

#### Scenario: No API key
- **WHEN** a receipt is submitted and the Meta Model API key is not configured outside demo mode
- **THEN** the user sees "Leer facturas no está disponible por ahora." and nothing is stored
