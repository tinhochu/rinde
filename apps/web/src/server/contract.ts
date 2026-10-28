// Wire contract consumed by apps/mobile (see apps/mobile/lib/market.ts). Keep in sync.
import { z } from "zod";

export type Store = "Éxito" | "Jumbo" | "D1" | "Carulla";
export type Unit = "g" | "ml" | "und";
/** Rinde's aisles; the mobile app names them (apps/mobile/lib/shop.ts AISLE_NAMES). */
export type Aisle = "produce" | "dairy" | "pantry" | "meat" | "bakery" | "drinks" | "home" | "personal" | "other";

export type Offer = {
  id: string;
  store: Store;
  name: string;
  brand: string;
  ean: string;
  price: number;
  stock: number;
  pack: number;
  unit: Unit;
  image: string;
  url: string;
  observedAt: string;
  channel: "Tienda online" | "Tienda física";
  aisle: Aisle;
  /** Online: the store's catalog. Receipt: reported on a shopper's receipt, with the branch when printed. */
  source: "online" | "receipt";
  branch?: string;
  /** A receipt price read from a DIAN electronic invoice: labeled "factura electrónica" */
  einvoice?: true;
  /** A canonical fruit or vegetable priced per kg or per unit: receipts, plus online reference packs recognized by name since stores' own codes differ */
  produce?: Produce;
  /** A carton of eggs recognized by grade and count, so cartons compare across brands */
  egg?: Egg;
};

export type Egg = { grade: string; count: number };
export type Produce = { slug: string; per: "kg" | "unit" };

export const listItemSchema = z.object({
  id: z.string().max(150),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().positive().max(1_000_000),
  unit: z.enum(["g", "ml", "und"]),
  brand: z.string().max(80),
  allowSubstitution: z.boolean(),
});
export type ListItem = z.infer<typeof listItemSchema>;

export const pricesRequestSchema = z.object({
  area: z.string().max(120),
  items: z.array(listItemSchema).min(1).max(20),
});

export type LookupRow = { item: ListItem; offers: Offer[]; reasons: string[] };
export type LookupResult = { rows: LookupRow[]; checkedAt: string; area: string };
/**
 * One product across stores. Offers are matched by EAN (same barcode = same product), or by
 * canonical produce item for 1 kg / 1 unit fresh packs (stores code produce privately), or for
 * eggs by grade and count whatever the brand, cheapest
 * first, at most one per store. `missing` lists stores we checked that don't carry this EAN;
 * listings without an EAN, and fresh produce, can't prove absence and have `missing: []`.
 */
export type ComparedProduct = {
  key: string;
  name: string;
  brand: string;
  ean: string;
  pack: number;
  unit: Unit;
  image: string;
  offers: Offer[];
  inStore: Offer[];
  missing: Store[];
  aisle: Aisle;
  produce?: Produce;
  /** Set when stores' cartons of the same grade and count are compared regardless of brand */
  egg?: Egg;
  /** Most expensive minus cheapest store price; 0 with fewer than two stores */
  spread: number;
  /** Another product than the one searched (another brand, kind or size), shown as "Similar" */
  similar?: boolean;
  /** Why Muse grouped it with the searched product, one line in Spanish */
  reason?: string;
};

export type CatalogResult = { offers: Offer[]; products: ComparedProduct[]; reasons: string[]; checkedAt: string };

export const STORE_BY_SLUG = { exito: "Éxito", jumbo: "Jumbo", d1: "D1", carulla: "Carulla" } as const satisfies Record<string, Store>;
export const SLUG_BY_STORE = { "Éxito": "exito", Jumbo: "jumbo", D1: "d1", Carulla: "carulla" } as const satisfies Record<Store, string>;
