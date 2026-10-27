import "server-only";
import { expandAbbreviations, matchProduce, type ParsedLine } from "@rinde/core";
import { db, type RetailerSlug } from "@rinde/db";
import { chooseCandidates, MuseUnavailable } from "./muse";
import { searchListings, type ListingRow } from "./offers";

export type MatchedBy = "ean" | "code" | "alias" | "search" | "produce" | "user";

export type LineMatch = {
  /** Catalog listing at the receipt's store; null for produce (its listing is created on confirm) */
  listingId: string | null;
  name: string;
  image: string | null;
  size: string;
  by: MatchedBy;
  produce: { slug: string; name: string; unit: "kg" | "unit" } | null;
};

export type ListingOption = { listingId: string; name: string; image: string | null; size: string };

export type LineMatchResult = { index: number; match: LineMatch | null; options: ListingOption[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function sizeLabel(size: string | null, unit: ListingRow["unit"]): string {
  if (!size || !unit) return "";
  const n = Number(size);
  if (unit === "g") return n >= 1000 ? `${n / 1000} kg` : `${n} g`;
  if (unit === "ml") return n >= 1000 ? `${n / 1000} L` : `${n} ml`;
  return `${n} und`;
}

const option = (r: ListingRow): ListingOption => ({ listingId: r.listingId, name: r.name, image: r.imageUrl, size: sizeLabel(r.size, r.unit) });

/** Store listings whose product carries one of these printed codes (EAN, or a store's own code like Jumbo "116"). */
async function listingsByCode(store: RetailerSlug, codes: string[]) {
  if (codes.length === 0) return new Map<string, ListingOption>();
  // Store codes are sometimes printed zero-padded ("0116"); compare without leading zeros too.
  const variants = [...new Set(codes.flatMap((c) => [c, c.replace(/^0+/, "")]))];
  const rows = await db().retailerProduct.findMany({
    where: { retailer: { slug: store }, product: { ean: { in: variants } } },
    select: { id: true, name: true, imageUrl: true, product: { select: { ean: true, size: true, unit: true } } },
  });
  const byCode = new Map<string, ListingOption>();
  for (const r of rows) {
    const o = { listingId: r.id, name: r.name, image: r.imageUrl, size: sizeLabel(r.product.size?.toString() ?? null, r.product.unit) };
    byCode.set(r.product.ean!, o);
    byCode.set(r.product.ean!.replace(/^0+/, ""), o);
  }
  return byCode;
}

/** Catalog search on the expanded line text; relaxes to fewer words until something matches. */
async function searchCandidates(store: RetailerSlug, text: string): Promise<ListingOption[]> {
  const words = expandAbbreviations(text).split(" ").filter((w) => w.length >= 2 && !/\d/.test(w));
  for (let n = Math.min(words.length, 3); n >= 1; n--) {
    const rows = await searchListings(words.slice(0, n).join(" "), { stores: [store], perStore: 8 });
    if (rows.length) return rows.map(option);
  }
  return [];
}

/**
 * Proposes a catalog product for each receipt line, in order of confidence:
 * printed code → learned alias → produce item → catalog search with the model choosing among results.
 * The user confirms or changes every proposal before anything is stored.
 */
export async function matchLines(store: RetailerSlug, storeName: string, lines: ParsedLine[]): Promise<LineMatchResult[]> {
  const items = lines.filter((l) => l.kind === "item");
  const byCode = await listingsByCode(store, items.map((l) => l.code).filter((c): c is string => !!c));
  const aliases = new Map(
    (await db().receiptAlias.findMany({
      where: { store, text: { in: items.map((l) => norm(l.text)) } },
      select: { text: true, retailerProductId: true },
    })).map((a) => [a.text, a.retailerProductId]),
  );
  const aliasListings = new Map(
    (await db().retailerProduct.findMany({
      where: { id: { in: [...aliases.values()] } },
      select: { id: true, name: true, imageUrl: true, product: { select: { size: true, unit: true } } },
    })).map((r) => [r.id, { listingId: r.id, name: r.name, image: r.imageUrl, size: sizeLabel(r.product.size?.toString() ?? null, r.product.unit) }]),
  );

  const results: LineMatchResult[] = [];
  const toChoose: { index: number; text: string; options: ListingOption[] }[] = [];

  for (const line of items) {
    const coded = line.code ? byCode.get(line.code) ?? byCode.get(line.code.replace(/^0+/, "")) : undefined;
    if (coded) { results.push({ index: line.index, match: { ...coded, by: line.code!.length >= 8 ? "ean" : "code", produce: null }, options: [] }); continue; }

    const aliased = aliasListings.get(aliases.get(norm(line.text)) ?? "");
    if (aliased) { results.push({ index: line.index, match: { ...aliased, by: "alias", produce: null }, options: [] }); continue; }

    const produce = matchProduce(line.text);
    // Produce is recognized when the line starts with a produce word and is weighed or counted loose.
    if (produce) {
      const unit = line.quantity && (line.quantity.unit === "kg" || line.quantity.unit === "g") ? "kg" : produce.defaultUnit;
      results.push({
        index: line.index,
        match: { listingId: null, name: produce.name, image: null, size: unit === "kg" ? "por kg" : "por unidad", by: "produce", produce: { slug: produce.slug, name: produce.name, unit } },
        options: [],
      });
      continue;
    }

    const options = await searchCandidates(store, line.text);
    results.push({ index: line.index, match: null, options });
    if (options.length) toChoose.push({ index: line.index, text: line.text, options });
  }

  // One model call for every line that needs a choice; without the model, the top result is proposed.
  let chosen = new Map<number, string | null>();
  try {
    chosen = await chooseCandidates(storeName, toChoose.map((t) => ({ index: t.index, text: t.text, candidates: t.options.map((o) => ({ id: o.listingId, name: o.name, size: o.size })) })));
  } catch (e) {
    if (!(e instanceof MuseUnavailable)) throw e;
    chosen = new Map(toChoose.map((t) => [t.index, t.options[0]!.listingId]));
  }
  for (const r of results) {
    const id = chosen.get(r.index);
    const pick = id ? r.options.find((o) => o.listingId === id) : undefined;
    if (pick) r.match = { ...pick, by: "search", produce: null };
  }
  return results.sort((a, b) => a.index - b.index);
}
