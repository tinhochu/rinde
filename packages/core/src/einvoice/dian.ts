import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { EInvoiceError } from "./errors";

/** One invoice line as issued: amounts in pesos with their decimals, never rounded here. */
export interface DianLine {
  description: string;
  /** StandardItemIdentification (scheme 010 = GTIN, 999 = the store's code), else SellersItemIdentification */
  code: string | null;
  codeScheme: string | null;
  quantity: number;
  unitCode: string;
  /** LineExtensionAmount: after line allowances, before taxes */
  lineAmount: number;
  /** Sum of the line's TaxTotal/TaxAmount */
  tax: number;
  /** Sum of the line's allowances (AllowanceCharge with ChargeIndicator false), before taxes */
  allowance: number;
}

export interface DianInvoice {
  /** True when it came inside an AttachedDocument; false for a bare UBL Invoice */
  attached: boolean;
  /** The AttachedDocument holds a DIAN ApplicationResponse validating this invoice's CUFE */
  dianConfirmed: boolean;
  supplierNit: string;
  supplierName: string;
  /** PartyName/Name: the banner and branch, e.g. "ÉXITO LAURELES" */
  banner: string;
  /** PhysicalLocation address line and city */
  branchAddress: string;
  issuedAt: Date;
  number: string;
  cufe: string;
  currency: string;
  payable: number;
  rounding: number;
  lines: DianLine[];
}

const ROOTS = ["AttachedDocument", "Invoice", "CreditNote", "DebitNote", "ApplicationResponse"] as const;
type Root = (typeof ROOTS)[number];

// Elements that may repeat; everything else is read as a single node.
const REPEATED = new Set(["InvoiceLine", "TaxTotal", "TaxSubtotal", "AllowanceCharge", "Note", "DocumentResponse", "ParentDocumentLineReference", "Line", "PartyName"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Entities are never expanded (documents with a DTD are refused before parsing anyway).
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => REPEATED.has(name),
});

type Node = Record<string, unknown>;

const PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : PREDEFINED[e.toLowerCase()] ?? m);

/** Text of an element, whether it carries attributes or not. */
function text(node: unknown): string {
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "string") return decode(node).trim();
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object" && "#text" in node) return text((node as Node)["#text"]);
  return "";
}
const attr = (node: unknown, name: string) => (node && typeof node === "object" && !Array.isArray(node) ? String((node as Node)[`@_${name}`] ?? "") : "");
const child = (node: unknown, ...path: string[]): unknown => {
  let at = node;
  for (const key of path) {
    if (Array.isArray(at)) at = at[0];
    if (!at || typeof at !== "object") return undefined;
    at = (at as Node)[key];
  }
  return at;
};
const list = (node: unknown): unknown[] => (node === undefined ? [] : Array.isArray(node) ? node : [node]);

function parseXml(xml: string): { root: Root; node: Node } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new EInvoiceError("unvalidated", "document declares a DTD or entities");
  let parsed: Node;
  try {
    parsed = parser.parse(xml) as Node;
  } catch {
    throw new EInvoiceError("unvalidated", "malformed XML");
  }
  const root = ROOTS.find((r) => r in parsed);
  if (!root) throw new EInvoiceError("not_invoice", "unknown document type");
  return { root, node: parsed[root] as Node };
}

/** Every embedded document (CDATA in a Description) one level down, parsed and classified. */
function embedded(node: unknown, out: { root: Root; node: Node }[] = []) {
  if (Array.isArray(node)) { for (const n of node) embedded(n, out); return out; }
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Node)) {
    if (key === "Description" && typeof value === "string" && value.trim().startsWith("<")) out.push(parseXml(value.trim()));
    else if (key === "Description" && Array.isArray(value)) for (const v of value) { if (typeof v === "string" && v.trim().startsWith("<")) out.push(parseXml(v.trim())); }
    else if (typeof value === "object") embedded(value, out);
  }
  return out;
}

const amount = z.number().finite();
const invoiceSchema = z.object({
  supplierNit: z.string().regex(/^\d{6,12}$/),
  supplierName: z.string(),
  banner: z.string(),
  branchAddress: z.string(),
  issuedAt: z.date().refine((d) => !Number.isNaN(d.getTime())),
  number: z.string().min(1),
  cufe: z.string().regex(/^[0-9a-f]{32,}$/),
  currency: z.literal("COP"),
  payable: amount.nonnegative(),
  rounding: amount,
  lines: z.array(z.object({
    description: z.string().min(1),
    code: z.string().nullable(),
    codeScheme: z.string().nullable(),
    quantity: amount.positive(),
    unitCode: z.string(),
    lineAmount: amount.nonnegative(),
    tax: amount.nonnegative(),
    allowance: amount.nonnegative(),
  })).min(1).max(500),
});

const num = (node: unknown) => {
  const t = text(node);
  return t === "" ? NaN : Number(t);
};

/** "2026-10-26" + "18:19:19-05:00" → instant; a time without an offset is Colombia time. */
function issueInstant(date: string, time: string): Date {
  const t = time || "00:00:00";
  const offset = /([+-]\d{2}:?\d{2}|Z)$/.test(t) ? "" : "-05:00";
  return new Date(`${date}T${t}${offset}`);
}

function readInvoice(inv: Node) {
  const supplier = child(inv, "AccountingSupplierParty", "Party");
  const tax = child(supplier, "PartyTaxScheme");
  const legal = child(supplier, "PartyLegalEntity");
  const address = child(supplier, "PhysicalLocation", "Address");
  const totals = child(inv, "LegalMonetaryTotal");
  const lines = list(inv["InvoiceLine"]).map((line): DianLine => {
    const item = child(line, "Item");
    const standard = child(item, "StandardItemIdentification", "ID");
    const sellers = child(item, "SellersItemIdentification", "ID");
    const quantity = child(line, "InvoicedQuantity");
    const allowances = list(child(line, "AllowanceCharge")).filter((a) => text(child(a, "ChargeIndicator")).toLowerCase() === "false");
    return {
      description: text(child(item, "Description")).replace(/\s+/g, " "),
      code: text(standard) || text(sellers) || null,
      codeScheme: text(standard) ? attr(Array.isArray(standard) ? standard[0] : standard, "schemeID") || null : null,
      quantity: num(quantity),
      unitCode: attr(Array.isArray(quantity) ? quantity[0] : quantity, "unitCode").toUpperCase(),
      lineAmount: num(child(line, "LineExtensionAmount")),
      tax: list(child(line, "TaxTotal")).reduce<number>((s, t) => s + num(child(t, "TaxAmount")), 0),
      allowance: allowances.reduce<number>((s, a) => s + num(child(a, "Amount")), 0),
    };
  });
  const parsed = invoiceSchema.safeParse({
    supplierNit: (text(child(tax, "CompanyID")) || text(child(legal, "CompanyID"))).replace(/\D/g, ""),
    supplierName: text(child(tax, "RegistrationName")) || text(child(legal, "RegistrationName")),
    banner: text(child(supplier, "PartyName", "Name")),
    branchAddress: [text(child(address, "AddressLine", "Line")), text(child(address, "CityName"))].filter(Boolean).join(", "),
    issuedAt: issueInstant(text(inv["IssueDate"]), text(inv["IssueTime"])),
    number: text(inv["ID"]),
    cufe: text(inv["UUID"]).toLowerCase(),
    currency: text(inv["DocumentCurrencyCode"]).toUpperCase(),
    payable: num(child(totals, "PayableAmount")),
    rounding: text(child(totals, "PayableRoundingAmount")) ? num(child(totals, "PayableRoundingAmount")) : 0,
    lines,
  });
  if (!parsed.success) throw new EInvoiceError("unvalidated", `invoice shape: ${parsed.error.issues[0]?.path.join(".")}`);
  return parsed.data;
}

/** A DIAN ApplicationResponse accepting the document with this CUFE ("02": Documento validado por la DIAN). */
function validates(response: Node, cufe: string) {
  return list(response["DocumentResponse"]).some((r) =>
    text(child(r, "Response", "ResponseCode")) === "02" && text(child(r, "DocumentReference", "UUID")).toLowerCase() === cufe);
}

/**
 * Reads a DIAN e-invoice: an AttachedDocument embedding a UBL Invoice (type 01) and the DIAN
 * ApplicationResponse, or a bare Invoice. Buyer data (AccountingCustomerParty, the QR) is never read.
 * Fails closed: anything unexpected is "unvalidated"; credit/debit notes and other types "not_invoice".
 */
export function parseDianDocument(xml: string | Uint8Array): DianInvoice {
  const source = typeof xml === "string" ? xml : new TextDecoder("utf-8", { fatal: false }).decode(xml);
  const top = parseXml(source);
  const docs = top.root === "AttachedDocument" ? embedded(top.node) : [top];
  const invoices = docs.filter((d) => d.root === "Invoice");
  if (invoices.length !== 1) {
    throw new EInvoiceError(invoices.length ? "unvalidated" : "not_invoice", invoices.length ? "several invoices in one container" : "no invoice inside");
  }
  const inv = invoices[0]!.node;
  if (text(inv["InvoiceTypeCode"]) !== "01") throw new EInvoiceError("not_invoice", "invoice type is not 01");
  const data = readInvoice(inv);
  const attached = top.root === "AttachedDocument";
  const dianConfirmed = attached && docs.some((d) => d.root === "ApplicationResponse" && validates(d.node, data.cufe));
  return { attached, dianConfirmed, ...data };
}

/**
 * Whether the document carries enough proof of being a real DIAN invoice (einvoice-intake spec):
 * a container must hold a DIAN validation for the same CUFE; a bare invoice needs a well-formed CUFE.
 */
export function dianValidationOk(doc: DianInvoice): boolean {
  return doc.attached ? doc.dianConfirmed : /^[0-9a-f]{96}$/.test(doc.cufe);
}
