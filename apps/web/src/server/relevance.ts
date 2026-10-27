import { matchProduce } from "@rinde/core";
import { aisleOf } from "./aisles";

// Whether a store listing is the kind of thing a list item asks for. Text search matches a word
// anywhere in the name, so "café" finds "Yogurt Colácteos café" and "banano" finds "Ponqué Banano";
// a plan built on those compares different products and reports savings that aren't real.

const words = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).filter(Boolean);

/** Words in a request that don't name the product. */
const REQUEST_FILLER = new Set(["de", "del", "la", "el", "los", "las", "con", "en", "y", "para", "x", "un", "una"]);

/** Packaging words some stores put before the product ("Bolsa ARROZ SONORA"). */
const PACKAGING = new Set([
  "bolsa", "bolsita", "paquete", "pack", "caja", "sobre", "tarro", "lata", "botella", "frasco", "doypack",
  "bandeja", "malla", "combo", "display", "kit", "promo", "oferta", "x",
]);

/**
 * Generic requests whose products are sold under another head noun: D1 sells "Spaghetti Capríssima
 * 250 G", not "Pasta spaghetti". Without these, a store's cheapest listing never reaches the planner.
 */
const KIND_HEADS: Record<string, string[]> = {
  pasta: [
    "spaghetti", "spaguetti", "espagueti", "espaguetis", "fideo", "fideos", "macarron", "macarrones", "codito",
    "coditos", "tornillo", "tornillos", "penne", "fusilli", "conchita", "conchitas", "tallarin", "tallarines",
    "fettuccine", "linguine", "linguini", "lasana", "lasagna",
  ],
};

/** Singular and plural are the same product: huevo / huevos, tomate / tomates. */
const same = (a: string, b: string) => a === b || `${a}s` === b || `${b}s` === a || `${a}es` === b || `${b}es` === a;

/**
 * The listing's head noun must be the first word of the request, after packaging words and a
 * leading brand ("Alpina Leche Entera"), or a kind of it ("Spaghetti" for "pasta"). A "<noun> de <word>" listing only counts when the request
 * names that word too: "Pasta de Tomate" is not pasta and "Huevo de Codorniz" is not a hen's egg.
 * Fresh produce also has to sit in the produce aisle. A store left with no relevant listing is
 * reported as not quoted instead of quoted wrong.
 */
export function isRelevant(listing: { name: string; brand: string | null; category: string | null }, request: string): boolean {
  const asked = words(request).filter((w) => !REQUEST_FILLER.has(w));
  if (asked.length === 0) return true;
  // Fresh produce must be produce: "papa" is not "Papas Pringles" or frozen fries. D1 files it under
  // "Fresco", which sorts into no aisle, so there the listing's own name has to be that produce item.
  const produce = matchProduce(request);
  if (produce) {
    const aisle = aisleOf(listing.category, listing.name);
    if (aisle !== "produce" && !(aisle === "other" && matchProduce(listing.name)?.slug === produce.slug)) return false;
  }
  const name = words(listing.name);
  const brand = words(listing.brand ?? "");

  let i = 0;
  const skipPackaging = () => { while (i < name.length && (PACKAGING.has(name[i]!) || /^\d/.test(name[i]!))) i++; };
  skipPackaging();
  if (brand.length && brand.every((b, k) => name[i + k] === b) && !same(name[i]!, asked[0]!)) {
    i += brand.length;
    skipPackaging();
  }

  const head = name[i];
  const kind = !words(request).includes("de") && !!KIND_HEADS[asked[0]!]?.includes(head ?? "");
  if (!head || !(same(head, asked[0]!) || kind)) return false;
  if (name[i + 1] === "de" || name[i + 1] === "del") {
    const modifier = name[i + 2];
    if (modifier && !asked.slice(1).some((w) => same(w, modifier))) return false;
  }
  return true;
}
