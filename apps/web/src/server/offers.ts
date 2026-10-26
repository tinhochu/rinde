import { aisleOf } from "./aisles";
import "server-only";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import { retailerBySlug } from "@rinde/retailers";
import { STORE_BY_SLUG, type Offer, type Unit } from "./contract";

/** Snapshot prices older than this are never shown (plan-price-verification spec). */
const MAX_AGE_HOURS = 36;
export const LIVE_TIMEOUT_MS = 8_000;
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "x", "y", "para", "con", "en", "un", "una"]);

export function enabledRetailers(): RetailerSlug[] {
  return process.env["INGEST_EXITO"] === "1" ? ["d1", "jumbo", "exito"] : ["d1", "jumbo"];
}

/** Crude Spanish singularization so "huevos" matches "Huevo" and "limones" matches "Limón". */
export function stem(token: string): string {
  if (token.length > 4 && /[^aeiou]es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function searchTokens(term: string): string[] {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .slice(0, 6);
}

export type ListingRow = {
  listingId: string;
  observationId: string;
  slug: RetailerSlug;
  name: string;
  brand: string | null;
  ean: string | null;
  size: string | null;
  unit: "g" | "ml" | "unit" | null;
  category: string | null;
  imageUrl: string | null;
  url: string;
  price: number;
  stock: number | null;
  observedAt: Date;
  source: string;
};

/** Search the price snapshot and shape results for the client. */
export async function searchSnapshot(term: string, opts: { stores?: RetailerSlug[]; perStore?: number } = {}): Promise<Offer[]> {
  return (await searchListings(term, opts)).map(toOffer);
}

/**
 * Search the Postgres price snapshot. Every token must appear in the listing name
 * (accent-insensitive); names that start with the first token rank first, then price.
 * Only the latest available observation per listing within MAX_AGE_HOURS is returned.
 */
export async function searchListings(term: string, opts: { stores?: RetailerSlug[]; perStore?: number } = {}): Promise<ListingRow[]> {
  const tokens = searchTokens(term);
  if (tokens.length === 0) return [];
  const stores = opts.stores ?? enabledRetailers();
  const perStore = opts.perStore ?? 8;
  const stems = tokens.map(stem);
  const patterns = stems.map((t) => `%${t}%`);

  return db().$queryRaw<ListingRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (po."retailerProductId") po.id AS "observationId", po."retailerProductId", po.price, po.stock,
             po."observedAt", po.source
      FROM "PriceObservation" po
      WHERE po.available AND po."observedAt" > now() - make_interval(hours => ${MAX_AGE_HOURS})
      ORDER BY po."retailerProductId", po."observedAt" DESC
    ), ranked AS (
      SELECT rp.id AS "listingId", l."observationId", r.slug, rp.name, p.brand, p.ean, p.size::text AS size, p.unit, p.category,
             rp."imageUrl", rp.url, l.price, l.stock, l."observedAt", l.source,
             row_number() OVER (
               PARTITION BY r.slug
               ORDER BY (unaccent(lower(rp.name)) LIKE ${stems[0] + "%"}) DESC, l.price ASC
             ) AS rank
      FROM latest l
      JOIN "RetailerProduct" rp ON rp.id = l."retailerProductId"
      JOIN "Retailer" r ON r.id = rp."retailerId"
      JOIN "Product" p ON p.id = rp."productId"
      WHERE r.slug::text = ANY(${stores})
        AND unaccent(lower(rp.name)) LIKE ALL(${patterns})
    )
    SELECT * FROM ranked WHERE rank <= ${perStore} ORDER BY slug, rank`;
}

/** Latest available snapshot observation for each listing whose product has one of these EANs. */
export async function listingsByEan(eans: string[], stores: RetailerSlug[]): Promise<ListingRow[]> {
  if (eans.length === 0 || stores.length === 0) return [];
  return db().$queryRaw<ListingRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (po."retailerProductId") po.id AS "observationId", po."retailerProductId", po.price, po.stock,
             po."observedAt", po.source
      FROM "PriceObservation" po
      JOIN "RetailerProduct" rp ON rp.id = po."retailerProductId"
      JOIN "Product" p ON p.id = rp."productId"
      WHERE po.available AND po."observedAt" > now() - make_interval(hours => ${MAX_AGE_HOURS}) AND p.ean = ANY(${eans})
      ORDER BY po."retailerProductId", po."observedAt" DESC
    )
    SELECT rp.id AS "listingId", l."observationId", r.slug, rp.name, p.brand, p.ean, p.size::text AS size, p.unit, p.category,
           rp."imageUrl", rp.url, l.price, l.stock, l."observedAt", l.source
    FROM latest l
    JOIN "RetailerProduct" rp ON rp.id = l."retailerProductId"
    JOIN "Product" p ON p.id = rp."productId"
    JOIN "Retailer" r ON r.id = rp."retailerId"
    WHERE r.slug::text = ANY(${stores})`;
}

export function toOffer(r: ListingRow): Offer {
  const unit: Unit = r.unit === "unit" ? "und" : (r.unit ?? "und");
  return {
    id: r.listingId,
    store: STORE_BY_SLUG[r.slug],
    name: r.name,
    brand: r.brand ?? "",
    ean: r.ean ?? "",
    price: r.price,
    stock: r.stock ?? 0,
    // pack 0 = size unknown; the client excludes it from quantity math rather than guessing
    pack: r.size ? Number(r.size) : 0,
    unit,
    image: r.imageUrl ?? "",
    url: r.url,
    observedAt: r.observedAt.toISOString(),
    channel: "Tienda online",
    aisle: aisleOf(r.category, r.name),
  };
}

/**
 * Live search for stores the snapshot has nothing for. Results are recorded as
 * observations first, then served from the snapshot, so provenance is identical.
 */
export async function searchLive(term: string, stores: RetailerSlug[]): Promise<{ offers: Offer[]; failed: RetailerSlug[] }> {
  const prisma = db();
  const failed: RetailerSlug[] = [];
  await Promise.all(
    stores.map(async (slug) => {
      try {
        const found = await withTimeout(retailerBySlug[slug].search(term, { limit: 10, patient: false }), LIVE_TIMEOUT_MS);
        const retailer = await ensureRetailer(prisma, slug);
        for (const o of found) await recordOffer(prisma, retailer.id, { ...o, source: `${slug}:live-search` });
      } catch {
        failed.push(slug);
      }
    }),
  );
  const ok = stores.filter((s) => !failed.includes(s));
  return { offers: ok.length ? await searchSnapshot(term, { stores: ok }) : [], failed };
}

/** Snapshot first; fall back to a live search for stores with no snapshot hits. */
/** Whether a listing *is* the searched thing: its name starts with the term's first word. */
export function isThingFor(term: string) {
  const first = searchTokens(term)[0];
  const lead = first ? stem(first) : "";
  return (o: { name: string }) => !!lead && (searchTokens(o.name)[0]?.startsWith(lead) ?? false);
}

export async function findOffers(term: string, opts: { stores?: RetailerSlug[]; perStore?: number } = {}) {
  const stores = opts.stores ?? enabledRetailers();
  let offers = await searchSnapshot(term, { ...opts, stores });
  const tokens = searchTokens(term);
  // A listing *is* the thing searched when its name starts with it ("Manzana Royal Gala"), not when it's
  // only a flavor or scent ("Gaseosa … manzana"). A store whose snapshot has only the latter is asked live.
  const isThing = isThingFor(term);
  const covered = new Set(offers.filter(isThing).map((o) => o.store));
  const anything = new Set(offers.map((o) => o.store));
  const missing = stores.filter((s) => !covered.has(STORE_BY_SLUG[s]));
  const reasons: string[] = [];
  if (missing.length) {
    const live = await searchLive(term, missing);
    const seen = new Set(offers.map((o) => o.id));
    offers.push(...live.offers.filter((o) => !seen.has(o.id)));
    const found = new Set(live.offers.map((o) => o.store));
    for (const s of missing) {
      if (live.failed.includes(s) && !anything.has(STORE_BY_SLUG[s])) reasons.push(`${STORE_BY_SLUG[s]}: no respondió, intenta de nuevo.`);
    }
    // Store names differ ("tetra pak" is D1 wording): drop trailing words until each store matches something.
    let pending = missing.filter((s) => !live.failed.includes(s) && !found.has(STORE_BY_SLUG[s]) && !anything.has(STORE_BY_SLUG[s]));
    for (let n = tokens.length - 1; n >= 1 && pending.length; n--) {
      const relaxed = tokens.slice(0, n).join(" ");
      const more = await searchSnapshot(relaxed, { ...opts, stores: pending });
      offers.push(...more);
      const hit = new Set(more.map((o) => o.store));
      for (const s of pending) if (hit.has(STORE_BY_SLUG[s])) reasons.push(`${STORE_BY_SLUG[s]}: sin "${term}"; mostramos resultados para "${relaxed}".`);
      pending = pending.filter((s) => !hit.has(STORE_BY_SLUG[s]));
    }
    for (const s of pending) reasons.push(`${STORE_BY_SLUG[s]}: sin resultados para "${term}".`);
  }
  // The thing itself before things that merely mention it; callers cap the list.
  offers = [...offers.filter(isThing), ...offers.filter((o) => !isThing(o))];
  return { offers, reasons };
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}
