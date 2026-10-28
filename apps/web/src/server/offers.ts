import { aisleOf } from "./aisles";
import "server-only";
import { db, ensureRetailer, Prisma, recordOffer, type RetailerSlug } from "@rinde/db";
import { enabledStores, retailerBySlug } from "@rinde/retailers";
import { STORE_BY_SLUG, type Offer, type Unit } from "./contract";
import { eggOf } from "./eggs";
import { onlineProduceOf } from "./produce-online";

/** Snapshot prices older than this are never shown (plan-price-verification spec). */
export const ONLINE_PRICE_HOURS = 36;
/** Receipt prices count this long from the purchase time (community-prices spec). */
export const RECEIPT_PRICE_HOURS = 72;

/** Which prices a read returns: the online catalog, or prices reported on confirmed receipts. */
export type PriceSource = "online" | "receipt";

/**
 * Latest observation per listing from one source. Online reads never see community prices; receipt
 * reads see only lines of receipts that are still confirmed (a revoked receipt's prices disappear).
 */
function latestObservations(source: PriceSource, extra: Prisma.Sql = Prisma.empty) {
  const from =
    source === "online"
      ? Prisma.sql`FROM "PriceObservation" po
          WHERE po.available AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - make_interval(hours => ${ONLINE_PRICE_HOURS})`
      : Prisma.sql`FROM "PriceObservation" po
          JOIN "ReceiptLine" rl ON rl.id = po."receiptLineId"
          JOIN "Receipt" rc ON rc.id = rl."receiptId" AND rc.status = 'confirmed'
          WHERE po.available AND po.source = 'community:receipt' AND po."observedAt" > now() - make_interval(hours => ${RECEIPT_PRICE_HOURS})`;
  return Prisma.sql`
    SELECT DISTINCT ON (po."retailerProductId") po.id AS "observationId", po."retailerProductId", po.price, po.stock,
           po."observedAt", po.source, ${source === "receipt" ? Prisma.sql`rc.branch` : Prisma.sql`NULL::text`} AS branch,
           ${source === "receipt" ? Prisma.sql`rc.source` : Prisma.sql`NULL::text`} AS "receiptSource"
    ${from} ${extra}
    ORDER BY po."retailerProductId", po."observedAt" DESC`;
}
export const LIVE_TIMEOUT_MS = 8_000;
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "x", "y", "para", "con", "en", "un", "una"]);

export function enabledRetailers(): RetailerSlug[] {
  return enabledStores();
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

export type ReadOptions = { stores?: RetailerSlug[]; perStore?: number; source?: PriceSource };

export type ListingRow = {
  listingId: string;
  productId: string;
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
  /** Store branch printed on the receipt; null for online prices */
  branch: string | null;
  /** How the receipt arrived (photo | einvoice | einvoice-pdf); null for online prices */
  receiptSource?: string | null;
  /** The store's id, or `produce:<slug>:<kg|unit>` for a canonical produce item (receipt prices only) */
  externalId: string;
};

/** Search the price snapshot and shape results for the client. */
export async function searchSnapshot(term: string, opts: ReadOptions = {}): Promise<Offer[]> {
  return (await searchListings(term, opts)).map(toOffer);
}

/**
 * Search the Postgres price snapshot. Every token must appear in the listing name
 * (accent-insensitive); names that start with the first token rank first, then price.
 * Only the latest available observation per listing from `opts.source` (online by default) is returned.
 */
export async function searchListings(term: string, opts: ReadOptions = {}): Promise<ListingRow[]> {
  const tokens = searchTokens(term);
  if (tokens.length === 0) return [];
  const stores = opts.stores ?? enabledRetailers();
  const perStore = opts.perStore ?? 8;
  const stems = tokens.map(stem);
  const patterns = stems.map((t) => `%${t}%`);

  return db().$queryRaw<ListingRow[]>`
    WITH latest AS (${latestObservations(opts.source ?? "online")}), ranked AS (
      SELECT rp.id AS "listingId", rp."productId", l."observationId", r.slug, rp.name, p.brand, p.ean, p.size::text AS size, p.unit, p.category,
             rp."imageUrl", rp.url, rp."externalId", l.price, l.stock, l."observedAt", l.source, l.branch, l."receiptSource",
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

/**
 * Latest available observation for each listing whose product has one of these EANs, including
 * listings matched to that product from another barcode, and the product a matched barcode moved to.
 */
export async function listingsByEan(eans: string[], stores: RetailerSlug[], source: PriceSource = "online"): Promise<ListingRow[]> {
  if (eans.length === 0) return [];
  return listingsWhere(Prisma.sql`AND po."retailerProductId" IN (
    SELECT rp.id FROM "RetailerProduct" rp JOIN "Product" p ON p.id = rp."productId" WHERE p.ean = ANY(${eans})
    UNION
    SELECT rp.id FROM "RetailerProduct" rp
    JOIN "ProductMatch" pm ON pm."toProductId" = rp."productId"
    JOIN "Product" f ON f.id = pm."fromProductId" WHERE f.ean = ANY(${eans}))`, stores, source);
}

/**
 * Latest available observation for every store's listing of these products. A product is one EAN,
 * or one produce item and selling unit, so this is "the same thing at each store".
 */
export async function listingsForProducts(productIds: string[], stores: RetailerSlug[], source: PriceSource = "online"): Promise<ListingRow[]> {
  if (productIds.length === 0) return [];
  return listingsWhere(Prisma.sql`AND po."retailerProductId" IN (SELECT id FROM "RetailerProduct" WHERE "productId" = ANY(${productIds}))`, stores, source);
}

/**
 * Latest available observation for listings of one size (±0.5%) whose brand starts with `brand`'s
 * first word or isn't known: the pool a same-product judgment picks from at another store.
 */
export async function listingsOfSize(size: { amount: number; unit: "g" | "ml" | "unit" }, brand: string, stores: RetailerSlug[]): Promise<ListingRow[]> {
  const first = brand.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9ñ]+/).find(Boolean) ?? "";
  return listingsWhere(Prisma.sql`AND po."retailerProductId" IN (
    SELECT rp.id FROM "RetailerProduct" rp JOIN "Product" p ON p.id = rp."productId"
    WHERE p.unit::text = ${size.unit} AND p.size BETWEEN ${size.amount * 0.995} AND ${size.amount * 1.005}
      AND (p.brand IS NULL OR unaccent(lower(p.brand)) LIKE ${first + "%"}))`, stores, "online");
}

/** Latest available observation for every carton of eggs at these stores, to line cartons up by grade and count. */
export async function eggListings(stores: RetailerSlug[], source: PriceSource = "online"): Promise<ListingRow[]> {
  return listingsWhere(Prisma.sql`AND po."retailerProductId" IN (
    SELECT rp.id FROM "RetailerProduct" rp JOIN "Product" p ON p.id = rp."productId"
    WHERE unaccent(lower(rp.name)) LIKE 'huevo%' AND unaccent(lower(p.category)) LIKE '%huevo%')`, stores, source);
}

function listingsWhere(filter: Prisma.Sql, stores: RetailerSlug[], source: PriceSource): Promise<ListingRow[]> {
  if (stores.length === 0) return Promise.resolve([]);
  return db().$queryRaw<ListingRow[]>`
    WITH latest AS (${latestObservations(source, filter)})
    SELECT rp.id AS "listingId", rp."productId", l."observationId", r.slug, rp.name, p.brand, p.ean, p.size::text AS size, p.unit, p.category,
           rp."imageUrl", rp.url, rp."externalId", l.price, l.stock, l."observedAt", l.source, l.branch, l."receiptSource"
    FROM latest l
    JOIN "RetailerProduct" rp ON rp.id = l."retailerProductId"
    JOIN "Product" p ON p.id = rp."productId"
    JOIN "Retailer" r ON r.id = rp."retailerId"
    WHERE r.slug::text = ANY(${stores})`;
}

/**
 * Asks each store live for the EANs its snapshot lacks (`has` says what it already has), recording what
 * it finds. Returns the found listings and the stores that answered; a store that fails stays unknown.
 */
export async function lookupMissingEans(eans: string[], stores: RetailerSlug[], has: (ean: string, store: RetailerSlug) => boolean) {
  const answered = new Set<RetailerSlug>(stores);
  const reasons: string[] = [];
  const found: ListingRow[] = [];
  const prisma = db();
  await Promise.all(
    stores.map(async (slug) => {
      const wanted = eans.filter((ean) => !has(ean, slug));
      if (wanted.length === 0) return;
      try {
        const offers = await withTimeout(retailerBySlug[slug].byEans(wanted), LIVE_TIMEOUT_MS);
        const retailer = await ensureRetailer(prisma, slug);
        for (const o of offers) await recordOffer(prisma, retailer.id, { ...o, source: `${slug}:live-ean` });
        if (offers.length) found.push(...(await listingsByEan(offers.map((o) => o.ean!), [slug])));
      } catch {
        answered.delete(slug);
        reasons.push(`${STORE_BY_SLUG[slug]}: no pudimos confirmar qué productos tiene; puede tenerlos.`);
      }
    }),
  );
  return { found, answered, reasons };
}

export function toOffer(r: ListingRow): Offer {
  const unit: Unit = r.unit === "unit" ? "und" : (r.unit ?? "und");
  const coded = /^produce:([a-z0-9-]+):(kg|unit)$/.exec(r.externalId);
  const produce = coded ? { slug: coded[1]!, per: coded[2] as "kg" | "unit" } : onlineProduceOf(r);
  const egg = produce ? undefined : eggOf(r);
  return {
    id: r.listingId,
    store: STORE_BY_SLUG[r.slug],
    name: r.name,
    brand: r.brand ?? "",
    ean: r.ean ?? "",
    price: r.price,
    stock: r.stock ?? 0,
    // pack 0 = size unknown; the client excludes it from quantity math rather than guessing
    // A carton's count is read from its name; some stores file it in grams.
    pack: egg ? egg.count : r.size ? Number(r.size) : 0,
    unit: egg ? "und" : unit,
    image: r.imageUrl ?? "",
    url: r.url,
    observedAt: r.observedAt.toISOString(),
    channel: r.source.startsWith("community:") ? "Tienda física" : "Tienda online",
    aisle: aisleOf(r.category, r.name),
    source: r.source.startsWith("community:") ? "receipt" : "online",
    ...(r.branch ? { branch: r.branch } : {}),
    ...(r.receiptSource === "einvoice" ? { einvoice: true } : {}),
    ...(produce ? { produce } : {}),
    ...(egg ? { egg } : {}),
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

export async function findOffers(term: string, opts: Omit<ReadOptions, "source"> = {}) {
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
