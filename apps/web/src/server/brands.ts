import "server-only";
import { normBrand } from "@rinde/core";
import { db } from "@rinde/db";
import { aisleOf } from "./aisles";

const TTL_MS = 6 * 3_600_000;
/** A brand counts once this many products carry it, so a one-off label doesn't turn a common word into a brand. */
const MIN_PRODUCTS = 3;

let cache: { at: number; brands: Set<string> } | null = null;

/** Every brand on at least 3 products, normalized like `normBrand`; cached 6 h. */
export async function knownBrands(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.brands;
  const rows = await db().$queryRaw<{ brand: string }[]>`
    SELECT brand FROM "Product" WHERE brand IS NOT NULL GROUP BY brand HAVING count(*) >= ${MIN_PRODUCTS}`;
  const brands = new Set(rows.map((r) => normBrand(r.brand)).filter((b) => b.length >= 3));
  cache = { at: Date.now(), brands };
  return brands;
}

/**
 * The brand a search names, if any: two words ("san fernando") before one ("alpina"). A word that
 * names a kind of product ("leche", "arroz") is never taken for a brand, even if some label uses it.
 */
export function brandIn(term: string, brands: Set<string>): string | null {
  const words = normBrand(term).split(" ").filter(Boolean);
  const isProductWord = (w: string) => aisleOf(null, w) !== "other";
  for (let i = 0; i + 1 < words.length; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (brands.has(pair)) return pair;
  }
  return words.find((w) => w.length >= 3 && !isProductWord(w) && brands.has(w)) ?? null;
}
