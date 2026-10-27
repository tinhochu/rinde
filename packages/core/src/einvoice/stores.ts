import type { ReceiptStore } from "../receipt/types";

/**
 * Supplier NIT (without its check digit) → the store it may be, and which banners count.
 * Éxito's NIT is confirmed by a real invoice; Cencosud's (Jumbo) and Koba's (D1) come from public
 * records until a real invoice of each confirms them. A wrong entry only rejects (fails closed).
 */
const COMPANIES: { nit: string; store: ReceiptStore; allow: RegExp | null; reject: RegExp | null }[] = [
  // Almacenes Éxito S.A. also issues Carulla, Surtimax, Super Inter and Surtimayorista invoices.
  { nit: "890900608", store: "exito", allow: /\bexito\b/, reject: /\bcarulla\b|\bsurtimax\b|\bsuper ?inter\b|\bsurti ?mayorista\b/ },
  // Cencosud Colombia S.A. also runs Metro, Easy and Spid.
  { nit: "900155107", store: "jumbo", allow: /\bjumbo\b/, reject: /\bmetro\b|\beasy\b|\bspid\b/ },
  // Koba Colombia S.A.S. only runs D1.
  { nit: "900276962", store: "d1", allow: null, reject: null },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** "890900608", "890.900.608-9" or "8909006089" → "890900608" when it is one of ours. */
function companyFor(nit: string) {
  const digits = nit.replace(/\D/g, "");
  return COMPANIES.find((c) => c.nit === digits || (digits.length === c.nit.length + 1 && digits.startsWith(c.nit)));
}

/**
 * The store an invoice is accepted for: its supplier NIT must belong to the company running D1, Jumbo
 * or Éxito and its banner (PartyName, else the branch line) must be that store's, accent-insensitive.
 */
export function invoiceStore(nit: string, banner: string, branch = ""): ReceiptStore | null {
  const company = companyFor(nit);
  if (!company) return null;
  const name = norm(banner || branch);
  if (company.reject?.test(name)) return null;
  if (company.allow && !company.allow.test(name)) return null;
  return company.store;
}
