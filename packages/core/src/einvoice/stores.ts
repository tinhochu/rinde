import type { ReceiptStore } from "../receipt/types";

/**
 * Supplier NIT (without its check digit) → the stores it may be, by banner, and which banners never count.
 * Éxito's NIT is confirmed by real invoices (Éxito and Carulla); Cencosud's (Jumbo) and Koba's (D1) come
 * from public records until a real invoice of each confirms them. A wrong entry only rejects (fails closed).
 */
const COMPANIES: { nit: string; stores: { store: ReceiptStore; allow: RegExp | null }[]; reject: RegExp | null }[] = [
  // Almacenes Éxito S.A. issues Éxito and Carulla invoices, and also Surtimax, Super Inter and Surtimayorista.
  // Carulla first: a Carulla banner can also say "Éxito" ("CARULLA EXITO").
  {
    nit: "890900608",
    stores: [{ store: "carulla", allow: /\bcarulla\b/ }, { store: "exito", allow: /\bexito\b/ }],
    reject: /\bsurtimax\b|\bsuper ?inter\b|\bsurti ?mayorista\b/,
  },
  // Cencosud Colombia S.A. also runs Metro, Easy and Spid.
  { nit: "900155107", stores: [{ store: "jumbo", allow: /\bjumbo\b/ }], reject: /\bmetro\b|\beasy\b|\bspid\b/ },
  // Koba Colombia S.A.S. only runs D1.
  { nit: "900276962", stores: [{ store: "d1", allow: null }], reject: null },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** "890900608", "890.900.608-9" or "8909006089" → "890900608" when it is one of ours. */
function companyFor(nit: string) {
  const digits = nit.replace(/\D/g, "");
  return COMPANIES.find((c) => c.nit === digits || (digits.length === c.nit.length + 1 && digits.startsWith(c.nit)));
}

/**
 * The store an invoice is accepted for: its supplier NIT must belong to the company running D1, Jumbo,
 * Éxito or Carulla and its banner (PartyName, else the branch line) must be that store's, accent-insensitive.
 */
export function invoiceStore(nit: string, banner: string, branch = ""): ReceiptStore | null {
  const company = companyFor(nit);
  if (!company) return null;
  const name = norm(banner || branch);
  if (company.reject?.test(name)) return null;
  return company.stores.find((s) => !s.allow || s.allow.test(name))?.store ?? null;
}
