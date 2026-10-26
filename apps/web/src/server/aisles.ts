import type { Aisle } from "./contract";

/**
 * Each store names its categories differently ("Gaseosas", "Gaseosas y sodas", "Jugos, Refrescos Y Maltas"),
 * so listings are sorted into Rinde's own aisles by keyword. Order matters: appliances and cleaning come
 * before food so "Extractor de leche" isn't dairy and "Jabones, detergentes…" isn't personal care.
 */
const RULES: [Aisle, RegExp][] = [
  ["home", /electrodom|calentador|extractor|procesador|licuadora|dispensador|utensilio|accesorio|menaje|detergent|suaviz|lavaloza|lavaplato|limpi|desinfect|blanqueador|papel higien|servillet|toalla de cocina|ambientador|bolsas? de basura|cuidado de la ropa|\baseo\b|\bhogar\b/],
  ["personal", /shampoo|champu|acondicionador|jabon|cuidado (oral|personal|capilar|facial|corporal)|facial|capilar|corporal|crema(s)? de manos|exfolia|dental|desodorante|panal|toallas? higien|afeitad|\bbebes?\b|del bebe/],
  // Processed fruit is pantry even when the name says "manzana".
  ["pantry", /compota|mermelada|jalea|pulpa|en almibar/],
  ["produce", /fruta(s)? y verdura|frutas?\b|verduras?|hortaliza|tuberculo|banano|platano|manzana|naranja|limon|aguacate|tomate|cebolla|papa criolla|zanahoria/],
  ["dairy", /lacteo|leche|margarina|yogur|queso|mantequilla|huevo|kumis|arequipe|crema de leche/],
  ["meat", /carne|pollo|pescado|embutido|marisco|cerdo|\bres\b|salchich|jamon|chorizo|mortadela|atun/],
  ["bakery", /panader|pasteler|arepa|ponque|torta|tostada|\bpan\b/],
  ["drinks", /bebida|gaseosa|soda|jugo|refresco|malta|\baguas?\b|cerveza|vino|licor|hidratante|energizante|\bte\b/],
  ["pantry", /despensa|grano|arroz|azucar|panela|endulz|enlatad|conserva|pasta|harina|mezcla|aceite|cereal|granola|avena|\bsal\b|salsa|aderez|condiment|cafe|chocolat|galleta|galleter|snack|helado|congelado|comidas? preparada|papas fritas|dulce|frutos secos|mermelada|pulpa/],
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function match(text: string | null): Aisle | null {
  if (!text) return null;
  const t = norm(text);
  return RULES.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** The store's own category decides; generic ones ("Supermercado", "Otros") fall back to the product name. */
export function aisleOf(category: string | null, name: string): Aisle {
  return match(category) ?? match(name) ?? "other";
}
