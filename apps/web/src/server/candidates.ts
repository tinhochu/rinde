import "server-only";
import type { BaseUnit, Candidate, PlanItem } from "@rinde/core";
import type { RetailerSlug } from "@rinde/db";
import { enabledRetailers, searchListings, searchLive, searchTokens, type ListingRow } from "./offers";

/** A shopping-list item before candidates are attached. */
export interface ItemRequest {
  id: string;
  label: string;
  /** Generic product query, e.g. "arroz blanco" */
  query: string;
  brand: string | null;
  quantity: number;
  unit: BaseUnit;
  essential: boolean;
  allowSubstitute: boolean;
  pinnedListingId?: string | null;
  dropped?: boolean;
}

const PER_STORE = 20;

/**
 * Interim candidate provider over the price snapshot (design D3). The Meta Muse
 * equivalence judge will later re-rank/filter this same output.
 * - literal match: the requested brand (or any product, when no brand was asked for)
 * - substitute: same product type, different brand
 */
export async function candidatesFor(item: ItemRequest, stores: RetailerSlug[] = enabledRetailers()): Promise<PlanItem> {
  const brand = item.brand?.trim() || null;
  const searches = [searchWithFallback(item.query, stores)];
  if (brand) searches.push(searchWithFallback(`${item.query} ${brand}`, stores));
  const rows = dedupe((await Promise.all(searches)).flat());

  const brandTokens = brand ? searchTokens(brand) : [];
  const candidates = rows
    // Unit-counted items ("1 und") accept any package; otherwise the unit kind must match
    .filter((r) => r.size !== null && r.unit !== null && (r.unit === item.unit || item.unit === "unit"))
    .map((r): Candidate => {
      const literal = brandTokens.length === 0 || matchesBrand(r, brandTokens);
      return {
        listingId: r.listingId,
        retailer: r.slug,
        name: r.name,
        brand: r.brand,
        price: r.price,
        size: { amount: Number(r.size), unit: r.unit! },
        url: r.url,
        source: r.source,
        observationId: r.observationId,
        observedAt: r.observedAt.toISOString(),
        priceStatus: r.source.endsWith(":live-verify") ? "live" : "snapshot",
        isLiteralMatch: literal,
        isSubstitute: !literal,
      };
    });

  return {
    id: item.id,
    label: item.label,
    quantity: item.quantity,
    unit: item.unit,
    essential: item.essential,
    allowSubstitute: item.allowSubstitute,
    pinnedListingId: item.pinnedListingId ?? null,
    dropped: item.dropped ?? false,
    candidates,
  };
}

async function searchWithFallback(term: string, stores: RetailerSlug[]): Promise<ListingRow[]> {
  const rows = await searchListings(term, { stores, perStore: PER_STORE });
  const missing = stores.filter((s) => !rows.some((r) => r.slug === s));
  if (missing.length === 0) return rows;
  // Live search records new observations; re-read so provenance is identical to the snapshot.
  const live = await searchLive(term, missing);
  const recovered = missing.filter((s) => !live.failed.includes(s));
  return recovered.length ? [...rows, ...(await searchListings(term, { stores: recovered, perStore: PER_STORE }))] : rows;
}

function matchesBrand(r: ListingRow, brandTokens: string[]) {
  const haystack = searchTokens(`${r.brand ?? ""} ${r.name}`);
  return brandTokens.every((t) => haystack.includes(t));
}

function dedupe(rows: ListingRow[]) {
  return [...new Map(rows.map((r) => [r.listingId, r])).values()];
}
