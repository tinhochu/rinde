import { normalizeInvoiceNumber } from "../receipt/checks";
import { parseQuantity } from "../receipt/parse";
import type { ParsedLine, SaleUnit } from "../receipt/types";
import type { DianInvoice } from "./dian";

/** A receipt line built from the XML; `priceDerived` when the unit price is total ÷ quantity. */
export type InvoiceLine = ParsedLine & { priceDerived: boolean };

/** What the receipt pipeline needs from an e-invoice; no buyer field exists on it to copy. */
export interface InvoiceReceiptInput {
  branch: string;
  purchasedAt: Date;
  /** PayableAmount, rounded to the peso */
  total: number;
  invoiceNumber: string;
  cufe: string;
  dianConfirmed: boolean;
  lines: InvoiceLine[];
  /** How far the lines may differ from the total and still add up: the rounding amount plus 1 peso per line */
  tolerance: number;
}

// UN/ECE rec 20 codes stores use; anything else is a unit with the raw code kept on the text.
const UNITS: Record<string, SaleUnit> = { "94": "unit", NIU: "unit", EA: "unit", H87: "unit", KGM: "kg", GRM: "g", LTR: "l", MLT: "ml" };
const WORD: Record<SaleUnit, string> = { unit: "", kg: "kg", g: "g", l: "l", ml: "ml" };

/**
 * Receipt lines from the invoice: the shelf price is the line amount plus that line's taxes, the
 * unit price is derived when the quantity isn't 1, and a line allowance becomes a discount line right
 * after its item (with its share of the line's tax), so the item shows its price before the discount.
 * Every number comes from the document; nothing is estimated.
 */
export function invoiceToReceiptInput(doc: DianInvoice): InvoiceReceiptInput {
  const lines: InvoiceLine[] = [];
  for (const l of doc.lines) {
    const unit = UNITS[l.unitCode];
    const net = Math.round(l.lineAmount + l.tax);
    const taxRate = l.lineAmount > 0 ? l.tax / l.lineAmount : 0;
    const discount = l.allowance > 0 ? Math.round(l.allowance * (1 + taxRate)) : 0;
    const total = net + discount;
    const quantity = parseQuantity(`${l.quantity} ${WORD[unit ?? "unit"]}`.trim());
    const single = quantity?.value === 1;
    lines.push({
      index: lines.length, kind: "item", text: unit ? l.description : `${l.description} [${l.unitCode}]`,
      code: l.code, quantity, unitPrice: quantity ? (single ? total : Math.round(total / quantity.value)) : null, total,
      priceDerived: !single,
    });
    if (discount) {
      lines.push({
        index: lines.length, kind: "discount", text: `Descuento ${l.description}`, code: null,
        quantity: parseQuantity("1"), unitPrice: null, total: -discount, priceDerived: false,
      });
    }
  }
  return {
    branch: doc.banner,
    purchasedAt: doc.issuedAt,
    total: Math.round(doc.payable),
    invoiceNumber: normalizeInvoiceNumber(doc.number) ?? doc.number.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    cufe: doc.cufe,
    dianConfirmed: doc.dianConfirmed,
    lines,
    tolerance: Math.ceil(Math.abs(doc.rounding)) + doc.lines.length,
  };
}
