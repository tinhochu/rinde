import type { Extraction, LineCheck, ParsedLine, Reconciliation, ReceiptStore } from "./types";

/**
 * quantity × unit price must equal the printed line total. Weighed lines round to the peso,
 * so the tolerance is max(1, quantity) pesos. A line missing any number is "illegible".
 */
export function checkLine(line: ParsedLine): LineCheck {
  const { index, quantity, unitPrice, total } = line;
  if (total === null) return { index, ok: false, issue: "illegible" };
  // Discounts and one-unit lines without a printed unit price only need a readable total.
  if (line.kind === "discount") return { index, ok: true, issue: null };
  if (unitPrice === null) {
    const single = quantity?.unit === "unit" && quantity.value === 1;
    return single ? { index, ok: true, issue: null } : { index, ok: false, issue: "illegible" };
  }
  if (!quantity) return { index, ok: false, issue: "illegible" };
  const expected = quantity.value * unitPrice;
  const ok = Math.abs(expected - total) <= Math.max(1, quantity.value);
  return { index, ok, issue: ok ? null : "mismatch" };
}

/** Line totals (discounts are negative) against the printed receipt total. */
export function reconcile(lines: ParsedLine[], printedTotal: number | null): Reconciliation {
  const linesTotal = lines.reduce((sum, l) => sum + (l.total ?? 0), 0);
  return { linesTotal, printedTotal, difference: printedTotal === null ? null : printedTotal - linesTotal };
}

/** Unit price as recorded: printed, or total ÷ quantity for a one-unit line that only prints a total. */
export function effectiveUnitPrice(line: ParsedLine): { price: number; derived: boolean } | null {
  if (line.unitPrice !== null) return { price: line.unitPrice, derived: false };
  if (line.total === null || !line.quantity) return null;
  return { price: Math.round(line.total / line.quantity.value), derived: true };
}

// Buyer identity and payment data printed on receipts. Store NITs on the header are also dropped:
// they aren't needed and look the same as a buyer's.
const PERSONAL = [
  /\b(c\.?\s?c\.?|nit|c[eé]dula|documento|identificaci[oó]n|cliente)\b[\s.:#-]*[\dx*.\s-]{5,}/i,
  /(\*{2,}|x{3,})\s?\d{4}\b/i,
  /\b(aprob(aci[oó]n)?|autoriz(aci[oó]n)?|aut|cod\.?\s?aut|rrn|voucher)\b[\s.:#-]*\d{4,}/i,
  /\b(visa|mastercard|master|amex|d[eé]bito|cr[eé]dito|tarjeta)\b.*\d{4}/i,
];

const hasPersonal = (s: string) => PERSONAL.some((re) => re.test(s));

/** Removes buyer and payment data before anything is stored or returned. */
export function scrubPersonalData(extraction: Extraction): Extraction {
  return {
    ...extraction,
    branch: hasPersonal(extraction.branch) ? "" : extraction.branch,
    lines: extraction.lines.filter((l) => !hasPersonal(l.text) && !hasPersonal(l.code)),
  };
}

/** "POS 1234-567890", "pos1234 567890" → "POS1234567890". */
export function normalizeInvoiceNumber(text: string): string | null {
  const n = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // At least a few digits: "POS" alone, or an empty read, is not an invoice number.
  return /\d{3,}/.test(n) ? n : null;
}

/** CUFE is a hex digest (SHA-384, 96 chars); keep hex only. */
export function normalizeCufe(text: string): string | null {
  const n = text.toLowerCase().replace(/[^0-9a-f]/g, "");
  return n.length >= 32 ? n : null;
}

/**
 * Canonical header key for duplicate detection: store | branch | purchase minute (UTC) | total.
 * The API hashes it. Taken only from read-only header fields, so editing lines can't change it.
 */
export function headerKey(store: ReceiptStore, branch: string, purchasedAt: Date, total: number): string {
  const b = branch.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const minute = purchasedAt.toISOString().slice(0, 16);
  return [store, b, minute, total].join("|");
}
