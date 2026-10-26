import type { PackageSize } from "@rinde/core";

export type RetailerSlug = "exito" | "jumbo" | "d1";

/** One priced listing as observed on a retailer's public site. Never synthesized. */
export interface Offer {
  retailer: RetailerSlug;
  externalId: string;
  name: string;
  brand: string | null;
  ean: string | null;
  category: string | null;
  size: PackageSize | null;
  /** COP, integer pesos */
  price: number;
  listPrice: number | null;
  available: boolean;
  /** Units the retailer reports in stock (VTEX AvailableQuantity) */
  stock: number | null;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceUrl: string;
  observedAt: Date;
}

export interface RetailerClient {
  slug: RetailerSlug;
  name: string;
  baseUrl: string;
  /** `patient` (default true) waits out a 429 cool-down; interactive callers pass false to fail fast. */
  search(term: string, opts?: { limit?: number; patient?: boolean }): Promise<Offer[]>;
  byEan(ean: string): Promise<Offer[]>;
  /** Batched EAN lookup: the same products at this retailer, one request per 30 EANs. */
  byEans(eans: string[]): Promise<Offer[]>;
  /** Current offers for specific SKUs (item ids), batched. Missing SKUs are simply absent. */
  byIds(skuIds: string[]): Promise<Offer[]>;
}
