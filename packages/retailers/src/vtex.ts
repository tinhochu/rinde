import { resolvePackageSize, type VtexSizeSource } from "./sizes";
import type { Offer, RetailerClient, RetailerSlug } from "./types";

const USER_AGENT = "RindeBot/0.1 (+https://github.com/rinde; price comparison research)";
const DEFAULT_MIN_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 3;
/** SKUs per batched lookup (repeated `fq=skuId:` params are OR-ed by VTEX). */
const SKU_BATCH_SIZE = 30;

function minIntervalMs() {
  const raw = Number(process.env["RETAILER_MIN_INTERVAL_MS"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_INTERVAL_MS;
}

// Shared per-host pacer: every client hitting the same origin coordinates here,
// so parallel retailers never hammer one host. Jumbo returns transient empty
// bodies under rapid load, hence the ≥2 s default (validated 2026-10-26).
const lastRequestByHost = new Map<string, number>();

async function pace(origin: string, floorMs = 0) {
  const min = Math.max(minIntervalMs(), floorMs);
  const wait = (lastRequestByHost.get(origin) ?? 0) + min - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestByHost.set(origin, Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// After a 429 the host is left alone until this time. Interactive lookups fail fast
// instead of waiting (they run under a request deadline); bulk searches wait it out.
const cooldownUntilByHost = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 30_000;

export class RateLimited extends Error {}

interface VtexConfig {
  slug: RetailerSlug;
  name: string;
  baseUrl: string;
  /** Path of the public catalog search endpoint */
  searchPath: string;
  /** EAN prefix for the retailer's own private label, if any */
  privateLabelPrefix?: string;
  /** Slower pacing for hosts that rate-limit harder than the default allows */
  minIntervalMs?: number;
  /**
   * The store's own seller on a site that also lists marketplace sellers (VTEX seller "1"). When set,
   * price and stock come only from it; a product only a marketplace seller has is not available here.
   */
  ownSellerId?: string;
}

// Minimal shape of the VTEX catalog_system search response we rely on.
interface VtexProduct extends VtexSizeSource {
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
      sellerId?: string;
      commertialOffer?: { Price?: number; ListPrice?: number; IsAvailable?: boolean; AvailableQuantity?: number };
    }>;
  }>;
}

class FatalStatus extends Error {}

/** Client for VTEX stores whose robots.txt permits the catalog search API. */
export function createVtexClient(config: VtexConfig): RetailerClient {
  const origin = new URL(config.baseUrl).origin;

  async function request(qs: string, opts: { patient?: boolean } = {}): Promise<{ products: VtexProduct[]; url: string }> {
    const url = `${config.baseUrl}${config.searchPath}?${qs}`;
    let lastError: unknown = new Error("unreachable");
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const cooldown = (cooldownUntilByHost.get(origin) ?? 0) - Date.now();
      if (cooldown > 0) {
        if (!opts.patient) throw new RateLimited(`${config.slug} cooling down after 429`);
        await sleep(cooldown);
      }
      await pace(origin, config.minIntervalMs);
      try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
        if (res.status === 429) {
          lastError = new Error(`${config.slug} 429 ${url}`);
          // Rate limited: honor Retry-After, else cool down; only patient callers retry.
          const retryAfter = Number(res.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_COOLDOWN_MS * attempt;
          cooldownUntilByHost.set(origin, Date.now() + wait);
          if (!opts.patient) throw new RateLimited(`${config.slug} 429 ${url}`);
        } else if (res.status >= 500) {
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
        if (error instanceof FatalStatus || error instanceof RateLimited) throw error;
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
        // The first seller can be an out-of-stock marketplace seller; use the first one actually selling.
        // With an own seller, only the store's price counts: never a marketplace seller's.
        const offer = config.ownSellerId
          ? (item.sellers?.find((s) => s.sellerId === config.ownSellerId)?.commertialOffer ?? {})
          : (item.sellers?.map((s) => s.commertialOffer).find((o) => o?.IsAvailable && (o.Price ?? 0) > 0) ??
            item.sellers?.[0]?.commertialOffer ?? {});
        return {
          retailer: config.slug,
          externalId: item.itemId,
          name: p.productName,
          brand: p.brand ?? null,
          ean: item.ean || null,
          category: p.categories?.[0]?.split("/").filter(Boolean).pop() ?? null,
          size: resolvePackageSize(p),
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
    async search(term, { limit = 10, patient = true } = {}) {
      const { products, url } = await request(`ft=${encodeURIComponent(term)}&_from=0&_to=${Math.min(limit, 50) - 1}`, { patient });
      return toOffers(products, url);
    },
    async byIds(skuIds) {
      const unique = [...new Set(skuIds)];
      const offers: Offer[] = [];
      for (let i = 0; i < unique.length; i += SKU_BATCH_SIZE) {
        const batch = unique.slice(i, i + SKU_BATCH_SIZE);
        const { products, url } = await request(batch.map((id) => `fq=skuId:${encodeURIComponent(id)}`).join("&"));
        offers.push(...toOffers(products, url).filter((o) => batch.includes(o.externalId)));
      }
      return offers;
    },
    async byEans(eans) {
      // Repeated `fq=alternateIds_Ean:` params are OR-ed, like skuId (verified on D1, Jumbo and Éxito, 2026-10-26).
      const unique = [...new Set(eans)];
      const offers: Offer[] = [];
      for (let i = 0; i < unique.length; i += SKU_BATCH_SIZE) {
        const batch = unique.slice(i, i + SKU_BATCH_SIZE);
        const { products, url } = await request(batch.map((ean) => `fq=alternateIds_Ean:${encodeURIComponent(ean)}`).join("&"));
        offers.push(...toOffers(products, url).filter((o) => o.ean && batch.includes(o.ean)));
      }
      return offers;
    },
    async byEan(ean) {
      const { products, url } = await request(`fq=alternateIds_Ean:${encodeURIComponent(ean)}`);
      return toOffers(products, url).filter((o) => o.ean === ean);
    },
  };
}
