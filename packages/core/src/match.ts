import { parsePackageSize, type PackageSize } from "./units";

/**
 * Same product across stores when barcodes differ. Two stages: these rules narrow a store's listings
 * to candidates that could be the product (same size, same brand), then a judge — Muse, or the strict
 * rule below when Muse is unavailable — decides which one, if any, it is. Nothing here sees a price.
 */
export interface MatchItem {
  id: string;
  name: string;
  brand: string | null;
  /** Stored package size; read from the name when absent */
  size?: PackageSize | null;
  /** Store-independent aisle, when known */
  aisle?: string | null;
}

/** Candidates shown to the judge per store. */
export const MAX_CANDIDATES = 8;

const words = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).filter(Boolean);

const CORPORATE = new Set(["sa", "sas", "s", "a", "ltda", "inc", "co", "cia"]);

/** Brand compared without case, accents, punctuation or corporate suffixes ("ALPINA S.A." = "Alpina"). */
export function normBrand(brand: string | null | undefined): string {
  return words(brand ?? "").filter((w) => !CORPORATE.has(w)).join(" ");
}

/** Units in a pack: "6 x 200 ml", "x6", "6Und 900ml" are 6; a single item is 1. */
export function packCount(name: string): number {
  const n = name.toLowerCase();
  const m = n.match(/(?:\bx\s*(\d+)\s*(?:und|un|ud)?\b|\b(\d+)\s*x\s*(?=\d))/) ?? n.match(/\b(\d+)\s*(?:und|unds|unidades|un|ud)\b(?=.*\d\s*(?:ml|g|gr|grs|kg|l|lt|cc)\b)/);
  const count = Number(m?.[1] ?? m?.[2] ?? 1);
  return count > 1 && count < 100 ? count : 1;
}

const sizeOf = (i: MatchItem) => i.size ?? parsePackageSize(i.name);

/** Same base unit and amount, and the same number of units in the pack. */
export function sameSize(a: MatchItem, b: MatchItem): boolean {
  const sa = sizeOf(a);
  const sb = sizeOf(b);
  if (!sa || !sb || sa.unit !== sb.unit) return false;
  return Math.abs(sa.amount - sb.amount) <= Math.max(sa.amount, sb.amount) * 0.005 && packCount(a.name) === packCount(b.name);
}

/** Store wording that says nothing about which product it is. */
const NOISE = new Set([
  "de", "del", "la", "el", "los", "las", "con", "en", "y", "para", "x", "un", "una", "und", "unds", "unidad", "unidades", "ud", "uds",
  "bolsa", "bolsita", "paquete", "pack", "caja", "sobre", "tarro", "lata", "botella", "frasco", "doypack", "bandeja", "malla",
  "tetra", "pak", "tetrapak", "tetrapack", "pet", "vaso", "combo", "display", "promo", "oferta",
]);
const UNIT_WORDS = /^(kgs?|kilos?|grs?|gramos|gm|g|libras?|lb|lts?|litros?|l|ml|cc)$/;

/** The words that tell varieties apart ("leche", "deslactosada"), without brand, size, packaging or store wording. */
export function varietyTokens(item: Pick<MatchItem, "name" | "brand">): Set<string> {
  const brand = new Set(words(item.brand ?? ""));
  return new Set(
    words(item.name)
      .filter((w) => !brand.has(w) && !NOISE.has(w) && !UNIT_WORDS.test(w) && !/\d/.test(w))
      // Singular and plural are the same word: "huevos" / "huevo".
      .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

const brandsAgree = (a: MatchItem, b: MatchItem) => {
  const ba = normBrand(a.brand);
  const bb = normBrand(b.brand);
  return !ba || !bb || ba === bb;
};

/**
 * Listings that could be the target: the same size and pack, the same brand whenever both say one,
 * and the same aisle when both are known. At most `limit`, those sharing more name words first.
 */
export function candidatesFor<T extends MatchItem>(target: MatchItem, listings: T[], limit = MAX_CANDIDATES): T[] {
  const want = varietyTokens(target);
  const shared = (l: T) => [...varietyTokens(l)].filter((w) => want.has(w)).length;
  return listings
    .filter((l) => l.id !== target.id && sameSize(target, l) && brandsAgree(target, l) && (!target.aisle || !l.aisle || target.aisle === l.aisle))
    .map((l) => ({ l, score: shared(l) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ l }) => l);
}

/** The strict rule, used without Muse: both name a brand and it's the same, same size, same variety words. */
export function sameProduct(a: MatchItem, b: MatchItem): boolean {
  const ba = normBrand(a.brand);
  if (!ba || ba !== normBrand(b.brand) || !sameSize(a, b)) return false;
  const va = varietyTokens(a);
  const vb = varietyTokens(b);
  return va.size > 0 && va.size === vb.size && [...va].every((w) => vb.has(w));
}

/** The one listing the strict rule accepts; none when no listing or more than one does. */
export function pickSameProduct<T extends MatchItem>(target: MatchItem, listings: T[]): T | null {
  const hits = listings.filter((l) => l.id !== target.id && sameProduct(target, l));
  return hits.length === 1 ? hits[0]! : null;
}
