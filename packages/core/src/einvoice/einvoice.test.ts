import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { checkLine, reconcile } from "../receipt";
import { dianValidationOk, EInvoiceError, invoiceStore, invoiceToReceiptInput, openInvoiceFiles, parseDianDocument, type DianInvoice } from "./index";

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
/** A one-page PDF with no text: the invoice PDF's bytes don't matter to these tests. */
const PDF = strToU8("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof EInvoiceError ? e.code : `unexpected: ${String(e)}`; }
  return "no error";
};

/** Rewrites the little-endian uint32 at `at`. */
function setU32(bytes: Uint8Array, at: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(at, value, true);
}

describe("openInvoiceFiles", () => {
  it("opens the store's zip in memory: the XML and its PDF", () => {
    const zip = zipSync({ "ad089090060802126QZ9667377.xml": strToU8(fixture("exito.xml")), "fv089090060802126QZ9667377.pdf": PDF });
    const files = openInvoiceFiles(zip, "089090060802126QZ9667377.zip");
    expect(files.map((f) => [f.kind, f.name])).toEqual([["xml", "ad089090060802126QZ9667377.xml"], ["pdf", "fv089090060802126QZ9667377.pdf"]]);
    expect(new TextDecoder().decode(files[0]!.data)).toBe(fixture("exito.xml"));
  });

  it("passes a bare XML or PDF through, by content rather than name", () => {
    expect(openInvoiceFiles(strToU8(fixture("exito.xml")), "factura.xml")[0]!.kind).toBe("xml");
    expect(openInvoiceFiles(PDF, "fv1.pdf")[0]!.kind).toBe("pdf");
    expect(code(() => openInvoiceFiles(strToU8("hola"), "factura.xml"))).toBe("unreadable");
  });

  it("stops a zip bomb by its declared size", () => {
    const zip = zipSync({ "ad1.xml": new Uint8Array(1000) });
    // Central directory "uncompressed size" (offset 24 in the entry) claims 2 GB.
    const central = zip.length - 22 - (46 + "ad1.xml".length);
    setU32(zip, central + 24, 2 * 1024 ** 3);
    setU32(zip, 22, 2 * 1024 ** 3);
    expect(code(() => openInvoiceFiles(zip, "bomb.zip"))).toBe("unreadable");
  });

  it("stops a zip bomb that lies about its size while inflating", () => {
    const zip = zipSync({ "ad1.xml": new Uint8Array(25 * 1024 * 1024) }, { level: 9 });
    expect(zip.length).toBeLessThan(100_000);
    setU32(zip, 22, 1000);
    const central = zip.length - 22 - (46 + "ad1.xml".length);
    setU32(zip, central + 24, 1000);
    expect(code(() => openInvoiceFiles(zip, "bomb.zip"))).toBe("unreadable");
  });

  it("refuses a zip with more than 20 entries", () => {
    const entries = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`ad${i}.xml`, strToU8("<a/>")]));
    expect(code(() => openInvoiceFiles(zipSync(entries), "many.zip"))).toBe("unreadable");
  });

  it("never opens a nested zip and skips files that aren't XML or PDF", () => {
    const inner = zipSync({ "ad1.xml": strToU8(fixture("exito.xml")) });
    expect(code(() => openInvoiceFiles(zipSync({ "inner.zip": inner, "readme.txt": strToU8("x") }), "outer.zip"))).toBe("unreadable");
    const files = openInvoiceFiles(zipSync({ "inner.zip": inner, "ad2.xml": strToU8("<a/>") }), "outer.zip");
    expect(files.map((f) => f.name)).toEqual(["ad2.xml"]);
  });

  it("refuses a .docx and anything over 10 MB", () => {
    const docx = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8("<w/>") });
    expect(code(() => openInvoiceFiles(docx, "factura.docx"))).toBe("type");
    expect(code(() => openInvoiceFiles(new Uint8Array(10 * 1024 * 1024 + 1), "big.zip"))).toBe("unreadable");
  });
});

describe("parseDianDocument", () => {
  it("reads the invoice header and lines from the AttachedDocument, validated by the DIAN", () => {
    const doc = parseDianDocument(fixture("carulla.xml"));
    expect(doc).toMatchObject({
      attached: true, dianConfirmed: true, supplierNit: "890900608", supplierName: "ALMACENES ÉXITO S.A",
      banner: "CARULLA EXPRESS EDS EL RETIRO", number: "QZ9667377", currency: "COP", payable: 16100, rounding: 0,
    });
    expect(doc.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect(doc.issuedAt.toISOString()).toBe("2026-10-26T23:19:19.000Z");
    expect(doc.branchAddress).toContain("RETIRO");
    expect(doc.lines).toEqual([
      { description: "GALLETAS X 4 TACO", code: "964159", codeScheme: "999", quantity: 1, unitCode: "94", lineAmount: 7226.89, tax: 1373.11, allowance: 0 },
      { description: "Pan Tajado Brioche", code: "3088509", codeScheme: "999", quantity: 1, unitCode: "94", lineAmount: 7500, tax: 0, allowance: 0 },
    ]);
    expect(dianValidationOk(doc)).toBe(true);
  });

  it("never reads the buyer", () => {
    const doc = parseDianDocument(fixture("exito.xml"));
    expect(JSON.stringify(doc)).not.toMatch(/COMPRADOR|1234567|example\.com|CALLE FALSA/);
  });

  it("reads a weighed line and a line allowance", () => {
    const doc = parseDianDocument(fixture("exito-weighed.xml"));
    expect(doc.lines[1]).toMatchObject({ description: "BANANO URABA", quantity: 0.845, unitCode: "KGM", lineAmount: 3363 });
    expect(doc.lines[2]).toMatchObject({ lineAmount: 6500, allowance: 1000 });
    expect(doc.payable).toBe(18463);
  });

  it("refuses a credit note as not a purchase invoice", () => {
    expect(code(() => parseDianDocument(fixture("exito-credit-note.xml")))).toBe("not_invoice");
  });

  it("does not confirm an invoice whose DIAN response is for another CUFE", () => {
    const doc = parseDianDocument(fixture("exito-cufe-mismatch.xml"));
    expect(doc.dianConfirmed).toBe(false);
    expect(dianValidationOk(doc)).toBe(false);
  });

  it("accepts a bare Invoice with a well-formed CUFE as not DIAN-confirmed", () => {
    const doc = parseDianDocument(fixture("exito-invoice.xml"));
    expect(doc).toMatchObject({ attached: false, dianConfirmed: false, banner: "ÉXITO LAURELES" });
    expect(dianValidationOk(doc)).toBe(true);
    expect(dianValidationOk({ ...doc, cufe: "abc123" })).toBe(false);
  });

  it("refuses a document with a DTD without resolving its entity", () => {
    expect(code(() => parseDianDocument(fixture("xxe.xml")))).toBe("unvalidated");
  });

  it("fails closed on a malformed or unexpected document", () => {
    expect(code(() => parseDianDocument("<Invoice><cbc:ID>"))).not.toBe("no error");
    expect(code(() => parseDianDocument("<Invoice xmlns:cbc='x'><cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode></Invoice>"))).toBe("unvalidated");
    expect(code(() => parseDianDocument("<Order/>"))).toBe("not_invoice");
    expect(code(() => parseDianDocument(fixture("exito.xml").replaceAll("<cbc:InvoiceTypeCode>01<", "<cbc:InvoiceTypeCode>02<")))).toBe("not_invoice");
  });
});

describe("invoiceToReceiptInput", () => {
  const line = (over: Partial<DianInvoice["lines"][number]>): DianInvoice["lines"][number] =>
    ({ description: "X", code: null, codeScheme: null, quantity: 1, unitCode: "94", lineAmount: 0, tax: 0, allowance: 0, ...over });
  const doc = (lines: DianInvoice["lines"], payable: number): DianInvoice => ({
    ...parseDianDocument(fixture("exito.xml")), lines, payable,
  });

  it("prices a line with its tax: 7.226,89 + IVA 1.373,11 → $8.600", () => {
    const input = invoiceToReceiptInput(parseDianDocument(fixture("exito.xml")));
    expect(input.lines[0]).toMatchObject({ kind: "item", text: "GALLETAS X 4 TACO", code: "964159", unitPrice: 8600, total: 8600, priceDerived: false });
    expect(input.lines[0]!.quantity).toMatchObject({ value: 1, unit: "unit" });
    expect(input).toMatchObject({ branch: "ÉXITO LAURELES", total: 16100, invoiceNumber: "QZ9667377", dianConfirmed: true });
    expect(input.lines.every((l) => checkLine(l).ok)).toBe(true);
    expect(reconcile(input.lines, input.total).difference).toBe(0);
  });

  it("derives the per-kg price of a weighed line: 0,845 kg for $3.363 → $3.980/kg", () => {
    const input = invoiceToReceiptInput(parseDianDocument(fixture("exito-weighed.xml")));
    expect(input.lines[1]).toMatchObject({ text: "BANANO URABA", unitPrice: 3980, total: 3363, priceDerived: true });
    expect(input.lines[1]!.quantity).toMatchObject({ value: 0.845, unit: "kg" });
    expect(checkLine(input.lines[1]!).ok).toBe(true);
  });

  it("shows a discounted line at its price before the discount, followed by the discount", () => {
    const input = invoiceToReceiptInput(parseDianDocument(fixture("exito-weighed.xml")));
    expect(input.lines.slice(2)).toMatchObject([
      { index: 2, kind: "item", text: "Pan Tajado Brioche", total: 7500, unitPrice: 7500 },
      { index: 3, kind: "discount", total: -1000 },
    ]);
    expect(reconcile(input.lines, input.total).difference).toBe(0);
  });

  it("gives a taxed discount its share of the tax", () => {
    // 10.000 − 1.000 allowance = 9.000 taxed at 19% (1.710): paid 10.710, shelf 11.900, discount 1.190
    const input = invoiceToReceiptInput(doc([line({ lineAmount: 9000, tax: 1710, allowance: 1000 })], 10710));
    expect(input.lines.map((l) => l.total)).toEqual([11900, -1190]);
  });

  it("keeps an unknown unit code on the line and counts it as units", () => {
    const input = invoiceToReceiptInput(doc([line({ description: "CAJA", unitCode: "BX", quantity: 2, lineAmount: 5000 })], 5000));
    expect(input.lines[0]).toMatchObject({ text: "CAJA [BX]", unitPrice: 2500, priceDerived: true });
  });

  it("allows the rounding amount plus a peso per line", () => {
    const input = invoiceToReceiptInput({ ...doc([line({ lineAmount: 100.4 }), line({ lineAmount: 100.4 })], 200), rounding: -0.8 });
    expect(input.tolerance).toBe(3);
  });
});

describe("invoiceStore", () => {
  it("accepts the Éxito banner of Almacenes Éxito", () => {
    expect(invoiceStore("890900608", "ÉXITO LAURELES")).toBe("exito");
    expect(invoiceStore("890.900.608-9", "Exito Express Envigado")).toBe("exito");
  });

  it("accepts the Carulla banner of Almacenes Éxito, even when it also says Éxito", () => {
    expect(invoiceStore("890900608", "CARULLA EXPRESS EDS EL RETIRO")).toBe("carulla");
    expect(invoiceStore("890900608", "CARULLA EXITO")).toBe("carulla");
    expect(invoiceStore("8909006089", "", "Carulla Oviedo")).toBe("carulla");
  });

  it("rejects the company's other banners", () => {
    for (const banner of ["SURTIMAX CALDAS", "SUPER INTER PALMIRA", "SURTIMAYORISTA ITAGUI", "SURTIMAX CARULLA"]) {
      expect(invoiceStore("890900608", banner)).toBeNull();
    }
    expect(invoiceStore("890900608", "ALMACEN 4877")).toBeNull();
  });

  it("accepts Jumbo but not Metro under Cencosud, and D1 under Koba", () => {
    expect(invoiceStore("900155107", "JUMBO CALLE 80")).toBe("jumbo");
    expect(invoiceStore("900155107", "METRO SOACHA")).toBeNull();
    expect(invoiceStore("900276962", "TIENDA LA 33")).toBe("d1");
  });

  it("rejects unknown suppliers whatever their banner says", () => {
    expect(invoiceStore("800123456", "ÉXITO")).toBeNull();
    expect(invoiceStore("", "JUMBO")).toBeNull();
  });

  it("falls back to the branch line when there is no banner", () => {
    expect(invoiceStore("890900608", "", "EXITO LAURELES CL 33")).toBe("exito");
  });
});
