import { parsePackageSize } from "@rinde/core";
import type { Offer, RetailerClient, RetailerSlug } from "./types";

const USER_AGENT = "RindeBot/0.1 (+https://github.com/rinde; price comparison research)";
const DEFAULT_MIN_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 3;

function minIntervalMs() {
  const raw = Number(process.env["RETAILER_MIN_INTERVAL_MS"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_INTERVAL_MS;
}

// Shared per-host pacer: every client hitting the same origin coordinates here,
// so parallel retailers never hammer one host. Jumbo returns transient empty
// bodies under rapid load, hence the ≥2 s default (validated 2026-10-26).
const lastRequestByHost = new Map<string, number>();

async function pace(origin: string) {
  const min = minIntervalMs();
  const wait = (lastRequestByHost.get(origin) ?? 0) + min - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestByHost.set(origin, Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      commertialOffer?: { Price?: number; ListPrice?: number; IsAvailable?: boolean; AvailableQuantity?: number };
    }>;
  }>;
}

class FatalStatus extends Error {}

/** Client for VTEX stores whose robots.txt permits the catalog search API. */
export function createVtexClient(config: VtexConfig): RetailerClient {
  const origin = new URL(config.baseUrl).origin;

  async function request(qs: string): Promise<{ products: VtexProduct[]; url: string }> {
    const url = `${config.baseUrl}${config.searchPath}?${qs}`;
    let lastError: unknown = new Error("unreachable");
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await pace(origin);
      try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`${config.slug} ${res.status} ${url}`);
        } else if (!res.ok && res.status !== 206) {
          // VTEX returns 206 Partial Content for paginated results; other 4xx fail fast.
          throw new FatalStatus(`${config.slug} ${res.status} ${url}`);
        } else {
          const text = await res.text();
          if (!text.trim()) {
            lastError = new Error(`${config.slug} empty body ${url}`);
          } else {
            try {
              return { products: JSON.parse(text) as VtexProduct[], url };
            } catch {
              lastError = new Error(`${config.slug} invalid JSON ${url}`);
            }
          }
        }
      } catch (error) {
        if (error instanceof FatalStatus) throw error;
        lastError = error;
      }
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
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
          stock: offer.AvailableQuantity ?? null,
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
