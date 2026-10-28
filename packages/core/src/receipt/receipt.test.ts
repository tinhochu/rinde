import { describe, expect, it } from "vitest";
import {
  checkLine, detectStore, headerKey, normalizeCufe, normalizeInvoiceNumber, parseCop, parseLines, parseQuantity,
  parseReceiptDate, reconcile, scrubPersonalData,
  expandAbbreviations, matchProduce,
} from "./index";
import type { Extraction, ExtractedLine } from "./types";

const line = (l: Partial<ExtractedLine>): ExtractedLine => ({ kind: "item", text: "PRODUCTO", code: "", quantity: "", unit_price: "", total: "", ...l });
const receipt = (lines: ExtractedLine[], extra: Partial<Extraction> = {}): Extraction => ({
  store: "Jumbo", branch: "Jumbo Las Vegas", purchased_at: "26/10/2026 14:32", total: "", invoice_number: "POS 1234-567890", cufe: "", lines, ...extra,
});

describe("parseCop", () => {
  it("reads thousands separators and drops cents", () => {
    expect(parseCop("3.980")).toBe(3980);
    expect(parseCop("$ 12.950")).toBe(12950);
    expect(parseCop("3,980")).toBe(3980);
    expect(parseCop("1.234.567")).toBe(1234567);
    expect(parseCop("12.950,00")).toBe(12950);
    expect(parseCop("550")).toBe(550);
  });
  it("reads discounts as negative", () => {
    expect(parseCop("-1.000")).toBe(-1000);
    expect(parseCop("1.000-")).toBe(-1000);
  });
  it("returns null for anything unclear, never a guess", () => {
    expect(parseCop("")).toBeNull();
    expect(parseCop("3.98")).toBeNull();
    expect(parseCop("3.9B0")).toBeNull();
    expect(parseCop("abc")).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("reads weighed quantities with a decimal comma", () => {
    expect(parseQuantity("0,845 KG")).toEqual({ value: 0.845, unit: "kg", base: { amount: 845, unit: "g" } });
    expect(parseQuantity("1,250kg")!.base).toEqual({ amount: 1250, unit: "g" });
  });
  it("reads units, grams and liters", () => {
    expect(parseQuantity("2")).toMatchObject({ value: 2, unit: "unit" });
    expect(parseQuantity("1 UN")).toMatchObject({ value: 1, unit: "unit" });
    expect(parseQuantity("500 GR")!.base).toEqual({ amount: 500, unit: "g" });
    expect(parseQuantity("1,5 LT")!.base).toEqual({ amount: 1500, unit: "ml" });
  });
  it("returns null for blank or unknown units", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("2 CAJAS")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
  });
});

describe("line check", () => {
  it("passes a weighed produce line within rounding", () => {
    const [l] = parseLines(receipt([line({ text: "BANANO URABA", quantity: "0,845 KG", unit_price: "3.980", total: "3.363" })]));
    expect(l).toMatchObject({ quantity: { value: 0.845, unit: "kg" }, unitPrice: 3980, total: 3363 });
    expect(checkLine(l!)).toEqual({ index: 0, ok: true, issue: null });
  });
  it("flags 2 × 4.890 ≠ 8.780", () => {
    const [l] = parseLines(receipt([line({ quantity: "2", unit_price: "4.890", total: "8.780" })]));
    expect(checkLine(l!)).toEqual({ index: 0, ok: false, issue: "mismatch" });
  });
  it("marks an unreadable price illegible instead of filling it", () => {
    const [l] = parseLines(receipt([line({ quantity: "2", unit_price: "", total: "9.780" })]));
    expect(l!.unitPrice).toBeNull();
    expect(checkLine(l!).issue).toBe("illegible");
  });
  it("accepts a one-unit line that prints only its total", () => {
    const [l] = parseLines(receipt([line({ total: "5.990" })]));
    expect(checkLine(l!).ok).toBe(true);
  });
});

describe("reconcile", () => {
  it("shows the difference against the printed total, counting discounts", () => {
    const lines = parseLines(receipt([
      line({ total: "50.300" }),
      line({ total: "3.000" }),
      line({ kind: "discount", text: "DESCUENTO", total: "-1.000" }),
    ]));
    expect(reconcile(lines, 53300)).toEqual({ linesTotal: 52300, printedTotal: 53300, difference: 1000 });
    expect(reconcile(lines, 52300).difference).toBe(0);
    expect(reconcile(lines, null).difference).toBeNull();
  });
});

describe("personal data", () => {
  it("drops the buyer's cédula, card digits and approval codes", () => {
    const scrubbed = scrubPersonalData(receipt([
      line({ text: "LECHE ALQUERIA 1100ML", total: "4.890" }),
      line({ text: "CLIENTE CC 1.017.234.567" }),
      line({ text: "VISA ****1234" }),
      line({ text: "APROBACION 004521" }),
    ]));
    expect(scrubbed.lines.map((l) => l.text)).toEqual(["LECHE ALQUERIA 1100ML"]);
    expect(JSON.stringify(scrubbed)).not.toContain("1.017");
  });
});

describe("store and date", () => {
  it("detects the four chains, including legal names", () => {
    expect(detectStore("KOBA COLOMBIA S.A.S")).toBe("d1");
    expect(detectStore("Tiendas D1")).toBe("d1");
    expect(detectStore("CENCOSUD COLOMBIA S.A.")).toBe("jumbo");
    expect(detectStore("Almacenes ÉXITO S.A.")).toBe("exito");
    expect(detectStore("Carulla")).toBe("carulla");
    expect(detectStore("CARULLA - ALMACENES EXITO S.A.")).toBe("carulla");
  });
  it("rejects sister chains that print the same legal name", () => {
    expect(detectStore("SURTIMAX Almacenes Éxito S.A.")).toBeNull();
    expect(detectStore("Super Inter")).toBeNull();
    expect(detectStore("METRO CENCOSUD COLOMBIA")).toBeNull();
    expect(detectStore("Easy Cencosud")).toBeNull();
    expect(detectStore("Tiendas ARA")).toBeNull();
  });
  it("reads dates in Colombia time", () => {
    expect(parseReceiptDate("26/10/2026 14:32")!.toISOString()).toBe("2026-10-26T19:32:00.000Z");
    expect(parseReceiptDate("26-10-26 2:32 PM")!.toISOString()).toBe("2026-10-26T19:32:00.000Z");
    expect(parseReceiptDate("2026-10-26 23:10:05")!.toISOString()).toBe("2026-10-27T04:10:05.000Z");
    expect(parseReceiptDate("31/02/2026")).toBeNull();
    expect(parseReceiptDate("sin fecha")).toBeNull();
  });
});

describe("duplicate keys", () => {
  it("normalizes invoice numbers so retakes match", () => {
    expect(normalizeInvoiceNumber("POS 1234-567890")).toBe("POS1234567890");
    expect(normalizeInvoiceNumber("pos1234 567890")).toBe("POS1234567890");
    expect(normalizeInvoiceNumber("POS")).toBeNull();
    expect(normalizeInvoiceNumber("")).toBeNull();
  });
  it("normalizes CUFE to hex", () => {
    expect(normalizeCufe("AB12 cd34 " + "e".repeat(40))).toBe("ab12cd34" + "e".repeat(40));
    expect(normalizeCufe("123")).toBeNull();
  });
  it("gives two photos of the same receipt the same header key", () => {
    const at = parseReceiptDate("26/10/2026 14:32")!;
    const atLater = parseReceiptDate("26/10/2026 14:32:59")!;
    expect(headerKey("jumbo", "Jumbo Las Vegas", at, 53300)).toBe(headerKey("jumbo", "JUMBO LAS VEGAS.", atLater, 53300));
    expect(headerKey("jumbo", "Jumbo Las Vegas", at, 53300)).not.toBe(headerKey("jumbo", "Jumbo Las Vegas", at, 53400));
  });
});

describe("produce and abbreviations", () => {
  it("maps produce lines by their leading words, preferring the longest alias", () => {
    expect(matchProduce("BANANO URABA")?.slug).toBe("banano");
    expect(matchProduce("TOMATE DE ARBOL")?.slug).toBe("tomate-de-arbol");
    expect(matchProduce("Papa Criolla x 500")?.slug).toBe("papa-criolla");
    expect(matchProduce("SALSA DE TOMATE FRUCO")).toBeNull();
    expect(matchProduce("JUGO DE NARANJA")).toBeNull();
  });
  it("expands receipt abbreviations", () => {
    expect(expandAbbreviations("ARZ DIANA 1KG")).toBe("arroz diana 1kg");
    expect(expandAbbreviations("LCH ALQUERIA 1100ML")).toBe("leche alqueria 1100ml");
  });
});
