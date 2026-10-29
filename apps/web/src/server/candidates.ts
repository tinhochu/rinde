import "server-only";
import type { BaseUnit, Candidate, PlanItem } from "@rinde/core";
import type { RetailerSlug } from "@rinde/db";
import { enabledRetailers, searchListings, searchLive, searchTokens, type ListingRow } from "./offers";
import { isRelevant } from "./relevance";

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
  const toCandidates = (list: ListingRow[]) => list
    // Unit-counted items ("1 und") accept any package; otherwise the unit kind must match
    .filter((r) => r.size !== null && r.unit !== null && (r.unit === item.unit || item.unit === "unit"))
    // Same kind of product: "café" must not price a coffee yogurt
    .filter((r) => isRelevant(r, item.query))
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
        priceStatus: r.source.startsWith("community:") ? "reported" : r.source.endsWith(":live-verify") ? "live" : "snapshot",
        isLiteralMatch: literal,
        isSubstitute: !literal,
      };
    });
  const online = toCandidates(rows);

  // Receipt prices only fill in stores with no online price the plan would accept (design D8).
  const acceptable = (c: Candidate) => c.isLiteralMatch || item.allowSubstitute;
  const uncovered = stores.filter((s) => !online.some((c) => c.retailer === s && acceptable(c)));
  const reported = uncovered.length
    ? toCandidates(dedupe((await Promise.all([item.query, ...(brand ? [`${item.query} ${brand}`] : [])].map((q) =>
        searchListings(q, { stores: uncovered, perStore: PER_STORE, source: "receipt" })))).flat()))
    : [];
  const candidates = [...online, ...reported];

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
  // A store counts as covered only by a listing of the thing itself: D1's search for "pasta spaghetti"
  // returns tomato paste, which leaves it as uncovered as no answer.
  const uncovered = (rows: ListingRow[], among: RetailerSlug[]) => among.filter((s) => !rows.some((r) => r.slug === s && isRelevant(r, term)));
  let rows = await searchListings(term, { stores, perStore: PER_STORE });
  let missing = uncovered(rows, stores);
  if (missing.length === 0) return rows;
  // Live search records new observations; re-read so provenance is identical to the snapshot.
  const live = await searchLive(term, missing);
  const recovered = missing.filter((s) => !live.failed.includes(s));
  if (recovered.length) rows = [...rows, ...(await searchListings(term, { stores: recovered, perStore: PER_STORE }))];
  // Stores word things differently: "atún en lata" is sold as "Atún en agua", "pasta spaghetti" as
  // "Spaghetti Capríssima". For a store still without one, read every looser wording (trailing words
  // dropped, then each later word alone): the first that finds some pasta may miss the cheapest spaghetti.
  const tokens = searchTokens(term);
  const looser = [...tokens.slice(0, -1).map((_, n) => tokens.slice(0, tokens.length - 1 - n).join(" ")), ...tokens.slice(1)];
  missing = uncovered(rows, stores);
  if (missing.length === 0) return rows;
  const more = await Promise.all(looser.map((relaxed) => searchListings(relaxed, { stores: missing, perStore: PER_STORE })));
  return [...rows, ...more.flat()];
}

function matchesBrand(r: ListingRow, brandTokens: string[]) {
  const haystack = searchTokens(`${r.brand ?? ""} ${r.name}`);
  return brandTokens.every((t) => haystack.includes(t));
}

function dedupe(rows: ListingRow[]) {
  return [...new Map(rows.map((r) => [r.listingId, r])).values()];
}
