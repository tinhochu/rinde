// Wire contract consumed by apps/mobile (see apps/mobile/lib/market.ts). Keep in sync.
import { z } from "zod";

export type Store = "Éxito" | "Jumbo" | "D1";
export type Unit = "g" | "ml" | "und";

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
  channel: "Tienda online";
};

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
 * One product across stores. Offers are matched by EAN (same barcode = same product),
 * cheapest first, at most one per store. `missing` lists stores we checked that don't
 * carry this EAN; listings without an EAN can't be matched and have `missing: []`.
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
  missing: Store[];
  /** Most expensive minus cheapest store price; 0 with fewer than two stores */
  spread: number;
};

export type CatalogResult = { offers: Offer[]; products: ComparedProduct[]; reasons: string[]; checkedAt: string };

export const STORE_BY_SLUG = { exito: "Éxito", jumbo: "Jumbo", d1: "D1" } as const satisfies Record<string, Store>;
export const SLUG_BY_STORE = { "Éxito": "exito", Jumbo: "jumbo", D1: "d1" } as const satisfies Record<Store, string>;
