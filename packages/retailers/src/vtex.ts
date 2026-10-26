import { parsePackageSize } from "@rinde/core";
import type { Offer, RetailerClient, RetailerSlug } from "./types";

const USER_AGENT = "RindeBot/0.1 (+https://github.com/rinde; price comparison research)";
const MIN_INTERVAL_MS = 300;

interface VtexConfig {
  slug: RetailerSlug;
  name: string;
  baseUrl: string;
  /** Path of the public catalog search endpoint */
  searchPath: string;
  /** EAN prefix for the retailer's own private label, if any */
  privateLabelPrefix?: string;
}

// Minimal shape of the VTEX catalog_system search response we rely on.
interface VtexProduct {
  productId: string;
  productName: string;
  brand?: string;
  linkText: string;
  categories?: string[];
  items: Array<{
    itemId: string;
    ean?: string;
    images?: Array<{ imageUrl: string }>;
    sellers?: Array<{
      commertialOffer?: { Price?: number; ListPrice?: number; IsAvailable?: boolean };
    }>;
  }>;
}

/** Client for VTEX stores whose robots.txt permits the catalog search API. */
export function createVtexClient(config: VtexConfig): RetailerClient {
  let lastRequest = 0;

  async function request(qs: string): Promise<{ products: VtexProduct[]; url: string }> {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();

    const url = `${config.baseUrl}${config.searchPath}?${qs}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    // VTEX returns 206 Partial Content for paginated results
    if (!res.ok && res.status !== 206) throw new Error(`${config.slug} ${res.status} ${url}`);
    return { products: (await res.json()) as VtexProduct[], url };
  }

  function toOffers(products: VtexProduct[], sourceUrl: string): Offer[] {
    const observedAt = new Date();
    return products.flatMap((p) =>
      p.items.map((item): Offer => {
        const offer = item.sellers?.[0]?.commertialOffer ?? {};
        return {
          retailer: config.slug,
          externalId: item.itemId,
          name: p.productName,
          brand: p.brand ?? null,
          ean: item.ean || null,
          category: p.categories?.[0]?.split("/").filter(Boolean).pop() ?? null,
          size: parsePackageSize(p.productName),
          price: Math.round(offer.Price ?? 0),
          listPrice: offer.ListPrice ? Math.round(offer.ListPrice) : null,
          available: Boolean(offer.IsAvailable) && (offer.Price ?? 0) > 0,
          url: `${config.baseUrl}/${p.linkText}/p`,
          imageUrl: item.images?.[0]?.imageUrl ?? null,
          source: `${config.slug}:vtex-catalog`,
          sourceUrl,
          observedAt,
        };
      }),
    );
  }

  return {
    slug: config.slug,
    name: config.name,
    baseUrl: config.baseUrl,
    async search(term, { limit = 10 } = {}) {
      const { products, url } = await request(`ft=${encodeURIComponent(term)}&_from=0&_to=${Math.min(limit, 50) - 1}`);
      return toOffers(products, url);
    },
    async byEan(ean) {
      const { products, url } = await request(`fq=alternateIds_Ean:${encodeURIComponent(ean)}`);
      return toOffers(products, url).filter((o) => o.ean === ean);
    },
  };
}
