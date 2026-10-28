import { API_ORIGIN } from "./config";

// The hero's live comparison: one common product priced at two or more stores, read from Rinde's
// catalog when the page loads. Prices are shown exactly as the API returns them and never stored;
// until they arrive, or if they don't, the receipt shows text without numbers.
const STAPLES = ["huevos", "arroz", "leche", "aceite"];
const BUDGET_MS = 4000;

export type Offer = { store: string; price: number; observedAt: string; source?: "online" | "receipt" };
export type Product = { name: string; pack: number; unit: "g" | "ml" | "und"; spread: number; offers: Offer[] };
export type Comparison = { product: Product; offers: Offer[] };

/** Of the products priced at two or more stores, the one with the biggest difference; one offer per store, cheapest first. */
export function pick(products: Product[]): Comparison | null {
  const compared = products
    .map((product) => {
      const seen = new Set<string>();
      const offers = [...product.offers]
        .sort((a, b) => a.price - b.price)
        .filter((o) => (seen.has(o.store) ? false : (seen.add(o.store), true)));
      return { product, offers };
    })
    .filter((c) => c.offers.length >= 2)
    .sort((a, b) => b.product.spread - a.product.spread);
  return compared[0] ?? null;
}

/** The first staple with prices from two or more stores, or null if none answers within the budget. */
export async function loadComparison(): Promise<Comparison | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUDGET_MS);
  try {
    for (const query of STAPLES) {
      const response = await fetch(`${API_ORIGIN}/api/catalog?query=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) continue;
      const data = await response.json();
      const found = pick(Array.isArray(data.products) ? data.products : []);
      if (found) return found;
    }
    return null;
  } catch {
    return null; // Network error or over budget: the receipt keeps its text.
  } finally {
    clearTimeout(timer);
  }
}

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("es-CO");

export const formatPrice = (value: number) => money.format(value).replace(/\s/g, "");

export function formatAge(iso: string, lang: "es" | "en") {
  const ago = new Intl.RelativeTimeFormat(lang, { numeric: "always", style: "short" });
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return ago.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return ago.format(-hours, "hour");
  return ago.format(-Math.round(hours / 24), "day");
}

export function formatPack(product: Product, units: string) {
  if (!product.pack) return "";
  if (product.unit === "und") return `${number.format(product.pack)} ${units}`;
  if (product.pack >= 1000) return `${number.format(product.pack / 1000)} ${product.unit === "g" ? "kg" : "l"}`;
  return `${number.format(product.pack)} ${product.unit}`;
}
