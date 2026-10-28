import { z } from "zod";
import { tints } from "./theme";
import { Aisle, ListItem, Offer, Store, Unit } from "./market";

export type ShopProduct = {
  id: string;
  name: string;
  term: string;
  image: string;
  pack: number;
  unit: Unit;
  brand: string;
  category: string;
  offer?: Offer;
  /** Every store's offer for the same EAN, cheapest first, when it came from a search comparison. Not persisted. */
  compare?: Pick<ComparedProduct, "offers" | "inStore" | "missing" | "produce">;
};
export type CartLine = { product: ShopProduct; count: number };
/** One product across stores, matched by EAN, produce item and unit, or egg grade and count (see apps/web/src/server/contract.ts). */
export type ComparedProduct = {
  key: string; name: string; brand: string; ean: string; pack: number; unit: Unit; image: string;
  offers: Offer[]; inStore?: Offer[]; missing: Store[]; spread: number; aisle: Aisle; produce?: { slug: string; per: "kg" | "unit" }; egg?: { grade: string; count: number };
  /** Another product than the one searched or shown (another brand or form), compared by unit price; `reason` is Muse's one line on why. */
  similar?: boolean; reason?: string;
};
export type CatalogResult = { offers: Offer[]; products: ComparedProduct[]; reasons: string[]; checkedAt: string };
export const AISLE_NAMES: Record<Aisle, string> = {
  produce: "Frutas y verduras", dairy: "Lácteos y huevos", pantry: "Despensa", meat: "Carnes y pescado", bakery: "Panadería",
  drinks: "Bebidas", home: "Aseo y hogar", personal: "Cuidado personal", other: "Otros",
};
export const photo = (id: string, width = 500) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
export const CATEGORIES = [
  { id: "all", name: "Para ti", term: "arroz", image: "photo-1542838132-92c53300491e", color: tints.all },
  { id: "produce", name: "Frutas y verduras", term: "tomate", image: "photo-1619566636858-adf3ef46400b", color: tints.produce },
  { id: "dairy", name: "Lácteos y huevos", term: "leche", image: "photo-1563636619-e9143da7973b", color: tints.dairy },
  { id: "pantry", name: "Despensa", term: "arroz", image: "photo-1586201375761-83865001e31c", color: tints.pantry },
  { id: "meat", name: "Carnes y pescado", term: "pollo", image: "photo-1607623814075-e51df1bdc82f", color: tints.meat },
  { id: "bakery", name: "Panadería", term: "pan", image: "photo-1509440159596-0249088772ff", color: tints.bakery },
  { id: "drinks", name: "Bebidas", term: "jugo", image: "photo-1613478223719-2ab802602423", color: tints.drinks },
  { id: "home", name: "Aseo y hogar", term: "detergente", image: "photo-1585421514738-01798e348b17", color: tints.home },
];

// Ideas de lista, no inventario: no tienen marca comercial, precio ni disponibilidad supuestos.
export const IDEAS: ShopProduct[] = [
  { id: "idea-banana", name: "Banano fresco", term: "banano", image: photo("photo-1571771894821-ce9b6c11b08e"), pack: 1000, unit: "g", brand: "", category: "produce" },
  { id: "idea-avocado", name: "Aguacate", term: "aguacate", image: photo("photo-1523049673857-eb18f1d7b578"), pack: 1000, unit: "g", brand: "", category: "produce" },
  { id: "idea-milk", name: "Leche entera", term: "leche entera", image: photo("photo-1563636619-e9143da7973b"), pack: 1000, unit: "ml", brand: "", category: "dairy" },
  { id: "idea-eggs", name: "Huevos", term: "huevos", image: photo("photo-1506976785307-8732e854ad03"), pack: 30, unit: "und", brand: "", category: "dairy" },
  { id: "idea-rice", name: "Arroz blanco", term: "arroz blanco", image: photo("photo-1586201375761-83865001e31c"), pack: 1000, unit: "g", brand: "", category: "pantry" },
  { id: "idea-tomato", name: "Tomate fresco", term: "tomate", image: photo("photo-1546094096-0df4bcaaa337"), pack: 1000, unit: "g", brand: "", category: "produce" },
  { id: "idea-bread", name: "Pan para la casa", term: "pan", image: photo("photo-1509440159596-0249088772ff"), pack: 1, unit: "und", brand: "", category: "bakery" },
  { id: "idea-coffee", name: "Café molido", term: "cafe molido", image: photo("photo-1559525839-b184a4d698c7"), pack: 500, unit: "g", brand: "", category: "pantry" },
  { id: "idea-chicken", name: "Pechuga de pollo", term: "pechuga de pollo", image: photo("photo-1607623814075-e51df1bdc82f"), pack: 1000, unit: "g", brand: "", category: "meat" },
];
export function fromOffer(offer: Offer, term: string, category: string): ShopProduct {
  const productTerm = offer.name.toLowerCase().split(offer.brand.toLowerCase()).join(" ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilogramos?|kilos?|gr|gramos?|g|ml|mililitros?|litros?|lt|l|und|unidades?|unid|uds)\b/gi, " ")
    .replace(/\bx\s*\d+\b/gi, " ").replace(/[()[\]·–—]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return { id: offer.id, name: offer.name, term: productTerm.length >= 2 ? productTerm : term, image: offer.image, pack: offer.pack, unit: offer.unit, brand: offer.brand, category, offer };
}
export function toListItems(cart: CartLine[]): ListItem[] {
  return cart.map(({ product, count }) => ({ id: product.id, name: product.term, quantity: product.pack * count, unit: product.unit, brand: product.brand, allowSubstitution: true }));
}
export function isFresh(offer?: Offer, now = Date.now()) {
  return !!offer && now - new Date(offer.observedAt).getTime() < 5 * 60000;
}
export function observedLabel(offer: Offer, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(offer.observedAt).getTime()) / 60000));
  if (mins < 1) return "Verificado ahora";
  return mins < 60 ? `Hace ${mins} min` : `Hace ${Math.floor(mins / 60)} h`;
}
const productSchema = z.object({ id: z.string().max(150), name: z.string().min(1).max(250), term: z.string().min(2).max(100), image: z.string().max(2000), pack: z.number().positive().max(1000000), unit: z.enum(["g", "ml", "und"]), brand: z.string().max(80), category: z.string().max(50) });
export const cartSchema = z.array(z.object({ product: productSchema, count: z.number().int().min(1).max(99) })).max(20).refine(lines => lines.every(line => line.product.pack * line.count <= 1000000), "Cantidad por producto demasiado grande.");
export const favoritesSchema = z.array(productSchema).max(100);
export const draftSchema = z.object({ budget: z.number().min(10000).max(10000000), people: z.number().int().min(1).max(12), zone: z.string().max(60), tripCost: z.number().int().min(0).max(100000).optional(), hasBudget: z.boolean().optional(), frequency: z.enum(["semanal", "quincenal", "mensual"]).optional(), stores: z.array(z.enum(["Éxito", "Jumbo", "D1", "Carulla"])).max(4).optional(), items: z.array(z.object({ id: z.string().max(150), name: z.string().min(1).max(100), quantity: z.number().positive().max(1000000), unit: z.enum(["g", "ml", "und"]), brand: z.string().max(80), allowSubstitution: z.boolean(), essential: z.boolean().optional() })).max(20) });
export type SavedDraft = z.infer<typeof draftSchema>;
/** How often the person shops; gives the budget its meaning ("$200.000 a la quincena"). */
export type Frequency = NonNullable<SavedDraft["frequency"]>;
