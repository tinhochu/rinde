import "server-only";
import { parsePackageSize, varietyTokens } from "@rinde/core";
import { db, type RetailerSlug } from "@rinde/db";
import { storePrices } from "./compare";
import type { ComparedProduct, Unit } from "./contract";
import { museConfig, type MuseConfig } from "./muse";
import { searchListings, toOffer, type ListingRow } from "./offers";
import { valueGroups, type ValueItem } from "./value-groups";

/** Products shown to Muse per product page, and kept after ranking. */
const POOL = 30;
const SHOWN = 6;
const TARGET = "target";

const unitOf = (u: ListingRow["unit"]): Unit => (u === "unit" ? "und" : (u ?? "und"));

/** A stored size the name contradicts ("x2.5kg" stored as 5 kg) would rank on a wrong unit price; such a row is left out. */
function sizeAgrees(r: ListingRow) {
  const named = parsePackageSize(r.name);
  return !named || Math.abs(named.amount - Number(r.size)) <= Number(r.size) * 0.01;
}

/**
 * "Similares": other products a shopper could buy instead — another brand, or the same brand in
 * another form — that Muse puts in the same kind as this product, whatever each store calls them.
 * Muse sees names and sizes only; each is ranked by the price per kg / L / unit the app computes
 * from stored prices and sizes, and is always marked as another product.
 */
export async function similarProducts(listingId: string, stores: RetailerSlug[], cfg: MuseConfig = museConfig()): Promise<ComparedProduct[]> {
  const listing = await db().retailerProduct.findUniqueOrThrow({
    where: { id: listingId },
    select: { productId: true, name: true, product: { select: { brand: true, size: true, unit: true } } },
  });
  const { product } = listing;
  if (!product.size || !product.unit) return [];
  const unit = unitOf(product.unit);
  const head = [...varietyTokens({ name: listing.name, brand: product.brand })][0];
  if (!head) return [];

  // Store-ordered rows; one entry per product, same measure, with a known size to price per unit.
  const byProduct = new Map<string, ListingRow[]>();
  for (const r of await searchListings(head, { stores, perStore: POOL })) {
    if (r.productId === listing.productId || unitOf(r.unit) !== unit || !r.size || Number(r.size) <= 0 || !sizeAgrees(r)) continue;
    byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  }
  const pool = [...byProduct].slice(0, POOL);
  if (pool.length === 0) return [];

  const items: ValueItem[] = [
    { key: TARGET, name: listing.name, brand: product.brand ?? "", pack: Number(product.size), unit },
    ...pool.map(([id, rows]) => ({ key: id, name: rows[0]!.name, brand: rows[0]!.brand ?? "", pack: Number(rows[0]!.size), unit })),
  ];
  const { groups } = await valueGroups(head, items, cfg);
  const kind = groups.find((g) => g.keys.includes(TARGET));
  if (!kind) return [];

  const products = kind.keys.filter((k) => k !== TARGET).map((id): ComparedProduct => {
    const rows = byProduct.get(id)!;
    const { offers, inStore } = storePrices(rows.map(toOffer));
    const lead = offers[0]!;
    const reason = kind.reasons?.[id];
    return {
      key: lead.ean ? `ean:${lead.ean}` : `id:${lead.id}`,
      name: lead.name, brand: lead.brand, ean: lead.ean, pack: lead.pack, unit: lead.unit, image: offers.find((o) => o.image)?.image ?? "",
      offers, inStore, missing: [], aisle: lead.aisle,
      spread: offers.length > 1 ? offers.at(-1)!.price - lead.price : 0,
      similar: true,
      ...(reason ? { reason } : {}),
    };
  });
  const perUnit = (p: ComparedProduct) => p.offers[0]!.price / p.pack;
  return products.sort((a, b) => perUnit(a) - perUnit(b)).slice(0, SHOWN);
}
