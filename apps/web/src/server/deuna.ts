import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, Prisma, type RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG } from "./contract";
import { enabledRetailers, searchTokens, stem } from "./offers";

/**
 * Service-to-service read of each store's online catalogue for DeUna's "mandado" orders
 * (docs/deuna-api.md). Online prices only: never receipt prices, descriptions or anything about
 * Rinde's users. Each item carries the store's own product photo (its VTEX image host, 400 px), so
 * DeUna can show what the product looks like; it links to the store's image, never a copy.
 */

export const DEUNA_CACHE = "private, max-age=300";
export const MAX_LIMIT = 50;

export type DeunaStore = { id: RetailerSlug; name: string; productCount: number; lastIngestedAt: string | null };
export type DeunaItem = {
  sku: string;
  ean: string | null;
  name: string;
  brand: string | null;
  size: string | null;
  category: string | null;
  referencePriceCop: number;
  observedAt: string;
  /** The store's own product photo, sized 400 × 400 by its image server, or `null`. */
  imageUrl: string | null;
};

const sha = (value: string) => createHash("sha256").update(value).digest();

/**
 * Why a request may not read the catalogue: the server has no key configured (fail closed), or the
 * caller's `x-api-key` isn't one of them. `DEUNA_API_KEY` holds one key, or several separated by
 * commas while one is being rotated out. Every key is compared, in constant time.
 */
export function deunaAuth(request: Request, env: Record<string, string | undefined> = process.env): "unconfigured" | "unauthorized" | null {
  const keys = (env["DEUNA_API_KEY"] ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return "unconfigured";
  const given = request.headers.get("x-api-key");
  if (!given) return "unauthorized";
  const digest = sha(given);
  let ok = false;
  for (const key of keys) ok = timingSafeEqual(digest, sha(key)) || ok;
  return ok ? null : "unauthorized";
}

/** The response for a request that may not read, or null to go on. */
export function deunaGuard(request: Request): Response | null {
  const why = deunaAuth(request);
  if (why === "unconfigured") return deunaError(503, "unavailable", "The DeUna API is not configured on this server.");
  if (why === "unauthorized") return deunaError(401, "unauthorized", "Missing or invalid x-api-key.");
  return null;
}

export function deunaError(status: number, error: string, message: string, issues?: z.core.$ZodIssue[]): Response {
  return Response.json({ error, message, ...(issues ? { issues } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

export function deunaJson(body: unknown): Response {
  return Response.json(body, { headers: { "Cache-Control": DEUNA_CACHE } });
}

/** A store DeUna may read, from its id; null for an unknown (or switched-off) store. */
export function deunaStore(id: string): RetailerSlug | null {
  return (enabledRetailers() as string[]).includes(id) ? (id as RetailerSlug) : null;
}

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const productsQuerySchema = z.object({
  q: optionalText(100).refine((q) => q === undefined || searchTokens(q).length > 0, { message: "q needs at least one word of 2+ letters" }),
  category: optionalText(100),
  cursor: optionalText(500),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
});
export type ProductsQuery = z.infer<typeof productsQuerySchema>;

/**
 * Where a page ends, as the sort key of its last item. Search pages sort by (name leads with the
 * first word, price, sku); browse pages by (name, sku).
 */
const cursorSchema = z.union([
  z.object({ m: z.literal("q"), lead: z.union([z.literal(0), z.literal(1)]), price: z.number().int(), sku: z.string() }),
  z.object({ m: z.literal("all"), name: z.string(), sku: z.string() }),
]);
type Cursor = z.infer<typeof cursorSchema>;

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** "500 g", "1 kg", "1,5 L", "6 und": the package size as people say it (es-CO decimal comma). */
export function humanSize(size: string | null, unit: string | null): string | null {
  const amount = size === null ? NaN : Number(size);
  if (!unit || !Number.isFinite(amount) || amount <= 0) return null;
  const num = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
  if (unit === "g") return amount >= 1000 ? `${num(amount / 1000)} kg` : `${num(amount)} g`;
  if (unit === "ml") return amount >= 1000 ? `${num(amount / 1000)} L` : `${num(amount)} ml`;
  if (unit === "unit") return `${num(amount)} und`;
  return null;
}

/**
 * The latest online observation of each of the store's listings, kept only when that observation says
 * it is for sale. Community (receipt) prices never count. No age limit: `observedAt` says how old it is.
 */
function pricedListings(slug: RetailerSlug) {
  return Prisma.sql`
    SELECT * FROM (
      SELECT DISTINCT ON (po."retailerProductId") po."retailerProductId", po.price, po.available, po."observedAt"
      FROM "PriceObservation" po
      JOIN "RetailerProduct" rp ON rp.id = po."retailerProductId"
      JOIN "Retailer" r ON r.id = rp."retailerId"
      WHERE r.slug::text = ${slug} AND po.source NOT LIKE 'community:%'
      ORDER BY po."retailerProductId", po."observedAt" DESC
    ) latest WHERE latest.available`;
}

type Row = { sku: string; ean: string | null; name: string; brand: string | null; size: string | null; unit: string | null; category: string | null; imageUrl: string | null; price: number; observedAt: Date; lead: number };

/**
 * A listing's photo for DeUna: only https links on the stores' VTEX image hosts (the same rule as
 * `fetchStorePhoto`), asked for at 400 × 400 so a phone downloads a thumbnail, not the full photo.
 */
export function deunaImage(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !/\.(vteximg\.com\.br|vtexassets\.com)$/.test(u.hostname)) return null;
  u.pathname = u.pathname.replace(/\/arquivos\/ids\/(\d+)(?:-\d+-\d+)?\//, "/arquivos/ids/$1-400-400/");
  return u.toString();
}

const toItem = (r: Row): DeunaItem => ({
  sku: r.sku,
  ean: r.ean,
  name: r.name,
  brand: r.brand,
  size: humanSize(r.size, r.unit),
  category: r.category,
  referencePriceCop: r.price,
  observedAt: r.observedAt.toISOString(),
  imageUrl: deunaImage(r.imageUrl),
});

function itemsQuery(slug: RetailerSlug, where: Prisma.Sql, lead: Prisma.Sql, after: Prisma.Sql, order: Prisma.Sql, take: number) {
  return db().$queryRaw<Row[]>`
    WITH latest AS (${pricedListings(slug)}), items AS (
      SELECT rp."externalId" AS sku, p.ean, rp.name, p.brand, p.size::text AS size, p.unit::text AS unit, p.category, rp."imageUrl",
             l.price, l."observedAt", ${lead} AS lead
      FROM latest l
      JOIN "RetailerProduct" rp ON rp.id = l."retailerProductId"
      JOIN "Product" p ON p.id = rp."productId"
      WHERE TRUE ${where}
    )
    SELECT * FROM items ${after} ${order} LIMIT ${take}`;
}

/** Every enabled store with how many products have a price and when its last snapshot finished. */
export async function listStores(): Promise<DeunaStore[]> {
  const slugs = enabledRetailers();
  return Promise.all(
    slugs.map(async (slug) => {
      const [[count], run] = await Promise.all([
        db().$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM (${pricedListings(slug)}) s`,
        db().ingestRun.findFirst({ where: { retailer: slug, status: "ok", finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
      ]);
      return { id: slug, name: STORE_BY_SLUG[slug], productCount: Number(count?.n ?? 0), lastIngestedAt: run?.finishedAt?.toISOString() ?? null };
    }),
  );
}

/**
 * One page of a store's priced products. With `q`, Rinde's catalog search: every word (singularized,
 * accent-insensitive) is in the name, names that start with the first word come first, then cheapest.
 * Without it, alphabetical. `category` matches the store's category name, ignoring case and accents.
 */
export async function listProducts(slug: RetailerSlug, query: ProductsQuery, cursor: Cursor | null): Promise<{ items: DeunaItem[]; nextCursor: string | null }> {
  const filters: Prisma.Sql[] = [];
  if (query.category) filters.push(Prisma.sql`AND unaccent(lower(p.category)) = unaccent(lower(${query.category}))`);

  let lead = Prisma.sql`0`;
  let order: Prisma.Sql;
  let after = Prisma.empty;
  if (query.q) {
    const stems = searchTokens(query.q).map(stem);
    filters.push(Prisma.sql`AND unaccent(lower(rp.name)) LIKE ALL(${stems.map((t) => `%${t}%`)})`);
    lead = Prisma.sql`CASE WHEN unaccent(lower(rp.name)) LIKE ${stems[0] + "%"} THEN 0 ELSE 1 END`;
    order = Prisma.sql`ORDER BY lead, price, sku`;
    if (cursor?.m === "q") after = Prisma.sql`WHERE (lead, price, sku) > (${cursor.lead}::int, ${cursor.price}::int, ${cursor.sku}::text)`;
  } else {
    order = Prisma.sql`ORDER BY name, sku`;
    if (cursor?.m === "all") after = Prisma.sql`WHERE (name, sku) > (${cursor.name}::text, ${cursor.sku}::text)`;
  }

  const where = filters.length ? Prisma.join(filters, " ") : Prisma.empty;
  const rows = await itemsQuery(slug, where, lead, after, order, query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const more = rows.length > query.limit && last;
  const nextCursor = !more
    ? null
    : encodeCursor(query.q ? { m: "q", lead: last.lead === 0 ? 0 : 1, price: last.price, sku: last.sku } : { m: "all", name: last.name, sku: last.sku });
  return { items: page.map(toItem), nextCursor };
}

/** One priced product by the store's own SKU, or null. */
export async function findProduct(slug: RetailerSlug, sku: string): Promise<DeunaItem | null> {
  const [row] = await itemsQuery(slug, Prisma.sql`AND rp."externalId" = ${sku}`, Prisma.sql`0`, Prisma.empty, Prisma.empty, 1);
  return row ? toItem(row) : null;
}

/** Whether a cursor fits the query it came with: a search cursor for a search, a browse cursor otherwise. */
export function cursorFits(cursor: Cursor, query: ProductsQuery): boolean {
  return query.q ? cursor.m === "q" : cursor.m === "all";
}
