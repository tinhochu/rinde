import type { BaseUnit, PackageSize } from "../units";

export type RetailerSlug = "d1" | "jumbo" | "exito" | "carulla";

/** A priced listing that could satisfy a list item. Prices are integer COP, always observed. */
export interface Candidate {
  listingId: string;
  retailer: RetailerSlug;
  name: string;
  brand: string | null;
  price: number;
  /** Package size; candidates without one cannot be used for quantity math */
  size: PackageSize | null;
  url: string;
  source: string;
  /** Id of the stored price observation this price comes from */
  observationId?: string;
  /** ISO timestamp of the price observation */
  observedAt: string;
  /** live: re-checked now; snapshot: online catalog; reported: from a shopper's receipt, never re-checked */
  priceStatus: "live" | "snapshot" | "reported";
  /** Same product the user asked for (same EAN, or same brand and type) */
  isLiteralMatch: boolean;
  /** An equivalent product that differs from what the user asked for */
  isSubstitute: boolean;
}

export interface PlanItem {
  id: string;
  /** What the user asked for, e.g. "Arroz Diana 1 kg" */
  label: string;
  /** Requested amount in the base unit (g, ml or unit) */
  quantity: number;
  unit: BaseUnit;
  essential: boolean;
  allowSubstitute: boolean;
  /** Forces a specific listing (set by an accepted swap) */
  pinnedListingId?: string | null;
  /** Removed from the list (set by an accepted drop) */
  dropped?: boolean;
  /** Why candidates were removed (e.g. stale price), shown if the item ends up unavailable */
  unavailableReason?: string;
  candidates: Candidate[];
}

export interface PlanOptions {
  /** Budget in COP */
  budget: number;
  /** Supermarkets the user can visit */
  retailers: RetailerSlug[];
  /** Cost of each stop beyond the first, in COP. Default 10.000 */
  tripCost?: number;
  /** Plan with exactly these stores, regardless of trip cost (set by an accepted "add a stop") */
  forceStores?: RetailerSlug[];
  /** Clock for price ages in line reasons (ms). Default Date.now() */
  now?: number;
}

export interface PlanLine {
  itemId: string;
  label: string;
  candidate: Candidate;
  packs: number;
  lineTotal: number;
  isSubstitute: boolean;
  /** Short, observed-price-based explanation of why this store/product was chosen */
  reason: string;
}

export interface StorePlan {
  retailer: RetailerSlug;
  lines: PlanLine[];
  subtotal: number;
}

export interface Unavailable {
  itemId: string;
  label: string;
  reason: string;
}

export interface Baseline {
  retailer: RetailerSlug;
  total: number;
  /** Item ids compared on both sides (baseline-unavailable items are excluded from both) */
  itemIds: string[];
  description: string;
}

export interface Alternative {
  stops: number;
  retailers: RetailerSlug[];
  total: number;
  /** total minus the recommended plan's total (negative = cheaper goods, more stops) */
  difference: number;
  recommended: boolean;
}

export interface Plan {
  stores: StorePlan[];
  /** Goods total in COP (trip cost is a decision weight, not money spent) */
  total: number;
  stops: number;
  tripCost: number;
  budget: number;
  /** budget − total; negative when over budget */
  remaining: number;
  overBudget: number;
  unavailable: Unavailable[];
  droppedItemIds: string[];
  baseline: Baseline | null;
  /** baseline.total minus this plan's total over the same items */
  savings: number | null;
  alternatives: Alternative[];
}
