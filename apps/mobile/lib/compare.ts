import { cop, STORES, type Offer, type Store } from "./market";

/** The stores a comparison is limited to. Empty means every store. */
export type StoreFilter = Store[];

export const allStores = (filter: StoreFilter) => filter.length === 0 || filter.length === STORES.length;

/**
 * Tapping a chip: from "Todas", a store becomes the only one; afterwards stores toggle in and out.
 * Every store selected, or none left, is "Todas" again.
 */
export function toggleStore(filter: StoreFilter, store: Store | "all"): StoreFilter {
  if (store === "all") return [];
  if (filter.length === 0) return [store];
  const next = filter.includes(store) ? filter.filter(s => s !== store) : [...filter, store];
  return next.length === STORES.length ? [] : next;
}

type Comparable = { offers: Offer[]; inStore?: Offer[]; missing: Store[] };

/**
 * The same product limited to the chosen stores: offers stay cheapest first and "missing" only names
 * chosen stores. Null when none of them has a price, so nothing unmatched is shown in its place.
 */
export function withinStores<T extends Comparable>(product: T, filter: StoreFilter): T | null {
  if (allStores(filter)) return product.offers.length ? product : null;
  const offers = product.offers.filter(o => filter.includes(o.store));
  if (!offers.length) return null;
  return {
    ...product,
    offers,
    inStore: product.inStore?.filter(o => filter.includes(o.store)),
    missing: product.missing.filter(s => filter.includes(s)),
  };
}

/** How much the cheapest offer saves against the dearest one, when two or more stores have it. */
export function savings(offers: Offer[]): { amount: number; versus: Store } | null {
  if (offers.length < 2) return null;
  const amount = offers.at(-1)!.price - offers[0]!.price;
  return amount > 0 ? { amount, versus: offers.at(-1)!.store } : null;
}

/**
 * Price per kg, per litre or per unit, so different pack sizes can be weighed fairly.
 * Null when the shelf price already is that (1 kg, 1 L, one unit, or a weighed produce price).
 */
export function unitPrice(offer: Offer): string | null {
  if (offer.produce || offer.pack <= 0) return null;
  if (offer.unit === "g" && offer.pack !== 1000) return `${cop(Math.round((offer.price * 1000) / offer.pack))}/kg`;
  if (offer.unit === "ml" && offer.pack !== 1000) return `${cop(Math.round((offer.price * 1000) / offer.pack))}/L`;
  if (offer.unit === "und" && offer.pack > 1) return `${cop(Math.round(offer.price / offer.pack))}/und`;
  return null;
}

/** "hace 5 min" / "hace 2 h" / "hace 3 días": how old a checked price is. */
export function ageLabel(observedAt: string, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(observedAt).getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} días`;
}
