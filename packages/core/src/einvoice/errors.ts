/**
 * Why an e-invoice file was refused. The API maps each code to the message shown to the person
 * (apps/web/src/server/einvoice.ts); nothing here is user-facing text.
 *  - type: not a .zip, .xml or .pdf
 *  - unreadable: too big, a zip bomb, too many entries, or nothing usable inside
 *  - not_invoice: a credit note, debit note or another document type
 *  - unvalidated: not a well-formed DIAN invoice, or no matching DIAN validation
 */
export type EInvoiceErrorCode = "type" | "unreadable" | "not_invoice" | "unvalidated";

export class EInvoiceError extends Error {
  constructor(public code: EInvoiceErrorCode, detail: string) {
    super(detail);
  }
}
