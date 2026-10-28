import type { Extraction, ParsedLine, ParsedQuantity, ReceiptStore, SaleUnit } from "./types";

/**
 * COP amount as printed on a Colombian receipt: "3.980", "$ 3.980", "3,980", "12.950,00", "-1.000".
 * A separator followed by exactly three digits groups thousands; a trailing ",00"/".00" is zero cents (dropped).
 * Pesos have no real cents, so "3.98" is a misread of "3.980" and returns null rather than 3.
 * Returns null for anything that isn't clearly a number — never a guess.
 */
export function parseCop(text: string): number | null {
  const raw = text.replace(/\s|\$|COP/gi, "");
  const m = raw.match(/^(-)?(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](00))?(-)?$/);
  if (!m) return null;
  const value = Number(m[2]!.replace(/[.,]/g, ""));
  const negative = !!(m[1] || m[4]);
  return negative ? -value : value;
}

const UNIT_ALIASES: [RegExp, SaleUnit][] = [
  [/^(kg|kgs|kilo|kilos|k)$/, "kg"],
  [/^(g|gr|grs|gramos?)$/, "g"],
  [/^(l|lt|lts|litros?)$/, "l"],
  [/^(ml|cc)$/, "ml"],
  [/^(un|und|unid|u|uds?|unidades?|x)?$/, "unit"],
];

/**
 * Quantity as printed: "2", "0,845 KG", "1 UN", "500 GR". Quantities use a decimal comma
 * (weights print three decimals), unlike money.
 */
export function parseQuantity(text: string): ParsedQuantity | null {
  const m = text.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z]*)\.?$/);
  if (!m) return null;
  const value = Number(m[1]!.replace(",", "."));
  const unit = UNIT_ALIASES.find(([re]) => re.test(m[2]!))?.[1];
  if (!unit || !(value > 0)) return null;
  const base =
    unit === "kg" ? { amount: round3(value * 1000), unit: "g" as const }
      : unit === "g" ? { amount: value, unit: "g" as const }
        : unit === "l" ? { amount: round3(value * 1000), unit: "ml" as const }
          : unit === "ml" ? { amount: value, unit: "ml" as const }
            : { amount: value, unit: "unit" as const };
  return { value, unit, base };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function parseLines(extraction: Extraction): ParsedLine[] {
  return extraction.lines.map((l, index) => ({
    index,
    kind: l.kind === "discount" ? "discount" : "item",
    text: l.text.trim(),
    code: l.code.replace(/\s/g, "") || null,
    // A line with no printed quantity is one unit — receipts omit "1".
    quantity: l.quantity.trim() ? parseQuantity(l.quantity) : parseQuantity("1"),
    unitPrice: l.unit_price.trim() ? parseCop(l.unit_price) : null,
    total: parseCop(l.total),
  }));
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Sister chains print the same legal name as Éxito (Almacenes Éxito) or Jumbo (Cencosud) but aren't
// the stores we compare, so their receipts are rejected even when the legal name matches.
const OTHER_CHAINS = /surtimax|super ?inter|surtimayorista|\bmetro\b|\beasy\b|\bara\b|olimpica|makro|pricesmart/;

/**
 * D1 is operated by Koba Colombia; Jumbo by Cencosud; Éxito and Carulla by Almacenes Éxito. Only those
 * four stores are accepted: anything else, including their sister chains, is null. Carulla receipts
 * also print "Almacenes Éxito", so Carulla is checked first.
 */
export function detectStore(text: string): ReceiptStore | null {
  const t = norm(text);
  if (OTHER_CHAINS.test(t)) return null;
  if (/\bd1\b|tiendas d1|koba/.test(t)) return "d1";
  if (/jumbo|cencosud/.test(t)) return "jumbo";
  if (/carulla/.test(t)) return "carulla";
  if (/exito/.test(t)) return "exito";
  return null;
}

/**
 * Purchase time as printed ("26/10/2026 14:32", "26-10-26 2:32 PM", "2026-10-26 14:32:05"),
 * interpreted in Colombia time (UTC−5, no DST). Null when the date isn't readable.
 */
export function parseReceiptDate(text: string): Date | null {
  const t = text.trim().toLowerCase();
  let y: number, mo: number, d: number;
  const dmy = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  const ymd = t.match(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (ymd) [y, mo, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else if (dmy) [d, mo, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  if (y < 100) y += 2000;
  const time = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/);
  let h = time ? Number(time[1]) : 0;
  const min = time ? Number(time[2]) : 0;
  const sec = time?.[3] ? Number(time[3]) : 0;
  if (time?.[4]?.startsWith("p") && h < 12) h += 12;
  if (time?.[4]?.startsWith("a") && h === 12) h = 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;
  // Reject impossible days such as 31/02.
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCMonth() !== mo - 1) return null;
  return new Date(Date.UTC(y, mo - 1, d, h + 5, min, sec));
}
