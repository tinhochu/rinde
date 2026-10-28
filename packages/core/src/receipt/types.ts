export type ReceiptStore = "d1" | "jumbo" | "exito" | "carulla";

/**
 * What the vision model returns: every value is text exactly as printed, empty when not legible.
 * Numbers stay strings on purpose; `parse.ts` turns them into numbers, so a misread can't hide.
 */
export interface ExtractedLine {
  /** "item" for a product, "discount" for a printed discount or promotion line */
  kind: "item" | "discount";
  text: string;
  /** EAN, PLU or store code when printed */
  code: string;
  /** "2", "0,845 KG", "1 UN" */
  quantity: string;
  unit_price: string;
  total: string;
}

export interface Extraction {
  store: string;
  branch: string;
  /** "26/10/2026 14:32" as printed */
  purchased_at: string;
  total: string;
  /** Prefix and consecutive, e.g. "POS 1234-567890" */
  invoice_number: string;
  /** Electronic invoice code, when printed */
  cufe: string;
  lines: ExtractedLine[];
}

export type SaleUnit = "unit" | "kg" | "g" | "l" | "ml";

export interface ParsedQuantity {
  value: number;
  unit: SaleUnit;
  /** Same quantity in base units: g, ml or unit */
  base: { amount: number; unit: "g" | "ml" | "unit" };
}

export interface ParsedLine {
  index: number;
  kind: "item" | "discount";
  text: string;
  code: string | null;
  quantity: ParsedQuantity | null;
  unitPrice: number | null;
  total: number | null;
}

export type LineIssue = "illegible" | "mismatch";

export interface LineCheck {
  index: number;
  ok: boolean;
  issue: LineIssue | null;
}

export interface Reconciliation {
  linesTotal: number;
  printedTotal: number | null;
  /** printedTotal − linesTotal; 0 when it adds up, null when the printed total is unreadable */
  difference: number | null;
}
