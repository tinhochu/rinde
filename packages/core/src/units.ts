export type BaseUnit = "g" | "ml" | "unit";

export interface PackageSize {
  /** Amount in the base unit, e.g. 1000 for 1 kg */
  amount: number;
  unit: BaseUnit;
}

const UNIT_FACTORS: Record<string, [BaseUnit, number]> = {
  kg: ["g", 1000], kilo: ["g", 1000], kilos: ["g", 1000], kgs: ["g", 1000],
  g: ["g", 1], gr: ["g", 1], grs: ["g", 1], gramos: ["g", 1], gm: ["g", 1],
  lb: ["g", 500], libra: ["g", 500], libras: ["g", 500], // Colombian libra = 500 g
  l: ["ml", 1000], lt: ["ml", 1000], lts: ["ml", 1000], litro: ["ml", 1000], litros: ["ml", 1000],
  ml: ["ml", 1], cc: ["ml", 1],
  und: ["unit", 1], un: ["unit", 1], unds: ["unit", 1], ud: ["unit", 1], uds: ["unit", 1], unidades: ["unit", 1], unidad: ["unit", 1],
};

// "1000 gr", "1.5 Lt", "x500grs", "900ml", "1,5 L"
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|grs?|gramos|gm|g|libras?|lb|lts?|litros?|l|ml|cc|unds?|uds?|ud|un|unidades|unidad)\b/gi;
// "x 6", "X6", "6 x 200 ml", "6x200ml" multipacks; never the "x2" of "x2.5kg", and never the
// "10 x2.5kg" of "Arroz Roa 10 x2.5kg", where the x belongs to the size and 10 is the product's name
const MULTIPACK_RE = /(?:\bx\s*(\d+)(?![.,]\d)\s*(?:und|un|ud)?\b|\b(\d+)(?:x|\s+x\s+)(?=\d))/i;

/**
 * Parse a retailer product name into a normalized package size.
 * Prefers mass/volume over unit counts ("Huevos x 30 und 1.8 kg" → 1800 g);
 * applies multipack multipliers ("6 x 200 ml" → 1200 ml).
 */
export function parsePackageSize(name: string): PackageSize | null {
  const matches = [...name.matchAll(SIZE_RE)].flatMap((m) => {
    const [unit, factor] = UNIT_FACTORS[m[2]!.toLowerCase()]!;
    const size = { amount: parseAmount(m[1]!, factor) * factor, unit };
    return plausibleSize(size) ? [size] : [];
  });
  if (matches.length === 0) return null;

  const measured = matches.find((m) => m.unit !== "unit");
  const best = measured ?? matches[0]!;

  // Éxito and Carulla end every name with the whole pack's net content in parentheses:
  // "Salchicha RICA x30und (500  gr)" is 500 g in all, not 30 × 500 g. There the dot is always a
  // decimal point ("(953.289  ml)", "(110.5  gr)"), never a thousands separator.
  const net = name.match(/\((\d+(?:[.,]\d+)?)\s*([a-z]+)\)\s*$/i);
  const netUnit = net ? UNIT_FACTORS[net[2]!.toLowerCase()] : undefined;
  if (net && netUnit && netUnit[0] !== "unit") {
    const size = { amount: round(Number(net[1]!.replace(",", ".")) * netUnit[1]), unit: netUnit[0] };
    if (plausibleSize(size)) return size;
  }

  if (measured) {
    const multi = name.match(MULTIPACK_RE);
    const count = Number(multi?.[1] ?? multi?.[2] ?? 1);
    // Only treat "N x 200 ml" as a multipack when the count isn't itself the size
    if (count > 1 && count < 100 && !matches.some((m) => m.amount === count && m.unit === best.unit))
      return { amount: round(best.amount * count), unit: best.unit };
  }
  return { amount: round(best.amount), unit: best.unit };
}

/**
 * Read a size number in Colombian notation. For grams and millilitres "1.000" and "1.750" are
 * thousands ("Arroz Diana 1.000 G"); for kg and litres "1.5" and "1,5" are decimals.
 */
export function parseAmount(raw: string, factor: number): number {
  if (factor === 1 && /^\d{1,3}[.,]\d{3}$/.test(raw)) return Number(raw.replace(/[.,]/, ""));
  return Number(raw.replace(",", "."));
}

/**
 * Under 2 g or 2 ml is never a grocery pack: it is a placeholder ("Yogurt (1 gr)") or a mislabeled
 * litre ("Gaseosa x 1.5 ml"). An unknown size is better than a unit price that is off by 1000×.
 */
export function plausibleSize(size: PackageSize): boolean {
  return size.amount > 0 && (size.unit === "unit" || size.amount >= 2);
}

/** Price per 1 base unit (COP per g, ml or unit). */
export function unitPrice(price: number, size: PackageSize): number {
  return price / size.amount;
}

/** Human-friendly comparable price: COP per kg / L / unit. */
export function displayUnitPrice(price: number, size: PackageSize): { value: number; per: "kg" | "L" | "und" } {
  const per = unitPrice(price, size);
  if (size.unit === "g") return { value: Math.round(per * 1000), per: "kg" };
  if (size.unit === "ml") return { value: Math.round(per * 1000), per: "L" };
  return { value: Math.round(per), per: "und" };
}

/** Minimum number of packs to cover a requested amount (same base unit). */
export function packsNeeded(requested: number, size: PackageSize): number {
  return Math.max(1, Math.ceil(round(requested / size.amount)));
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
