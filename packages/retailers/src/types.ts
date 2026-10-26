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
  search(term: string, opts?: { limit?: number }): Promise<Offer[]>;
  byEan(ean: string): Promise<Offer[]>;
}
