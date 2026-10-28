import { db, ensureRetailer, recordOffer } from "@rinde/db";
import { retailers, type Offer, type RetailerClient, type RetailerSlug } from "@rinde/retailers";

/** EANs per request: VTEX ORs repeated `fq=alternateIds_Ean:` filters. */
export const CROSS_FILL_BATCH = 30;
/** Same freshness as the prices shown to users. */
const FRESH_HOURS = 36;

export type FillResult = { found: number; checked: number; unchecked: string[] };

/**
 * Looks these EANs up at one store, batch by batch, waiting out rate limits. A failed batch is logged
 * and skipped; its EANs are returned as unchecked so the run can say what it couldn't cover.
 */
export async function fillStore(client: RetailerClient, eans: string[], record: (o: Offer) => Promise<void>): Promise<FillResult> {
  const result: FillResult = { found: 0, checked: 0, unchecked: [] };
  for (let i = 0; i < eans.length; i += CROSS_FILL_BATCH) {
    const batch = eans.slice(i, i + CROSS_FILL_BATCH);
    try {
      const offers = await client.byEans(batch, { patient: true });
      for (const o of offers) await record(o);
      result.found += offers.length;
      result.checked += batch.length;
    } catch (error) {
      console.warn(`[cross-fill] ${client.slug} batch ${i / CROSS_FILL_BATCH + 1} failed:`, String(error));
      result.unchecked.push(...batch);
    }
  }
  return result;
}

/** Every barcode with a fresh online price, and the stores that already have a fresh price for its product. */
async function freshBarcodes(): Promise<Map<string, Set<RetailerSlug>>> {
  const rows = await db().$queryRaw<{ ean: string; stores: RetailerSlug[] }[]>`
    WITH fresh AS (
      SELECT DISTINCT rp."productId", r.slug::text AS slug
      FROM "PriceObservation" po
      JOIN "RetailerProduct" rp ON rp.id = po."retailerProductId"
      JOIN "Retailer" r ON r.id = rp."retailerId"
      WHERE po.available AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - make_interval(hours => ${FRESH_HOURS})
    )
    SELECT p.ean, array_agg(f.slug) AS stores
    FROM fresh f JOIN "Product" p ON p.id = f."productId"
    -- D1's own brands are sold only at D1; short codes are store codes, not barcodes.
    WHERE p.ean IS NOT NULL AND length(p.ean) >= 8 AND NOT p."isPrivateLabel"
    GROUP BY p.ean`;
  return new Map(rows.map((r) => [r.ean, new Set(r.stores)]));
}

/**
 * After the daily ingest: asks each store for the barcodes other stores sell and it has no fresh
 * price for, so searches find cross-store prices already stored. Stores run one after another,
 * each in its own IngestRun row; one store failing doesn't stop the others.
 */
export async function crossFill(clients: RetailerClient[] = retailers()) {
  const barcodes = await freshBarcodes();
  for (const client of clients) {
    const started = Date.now();
    const wanted = [...barcodes].filter(([, stores]) => !stores.has(client.slug)).map(([ean]) => ean);
    const prisma = db();
    const retailer = await ensureRetailer(prisma, client.slug);
    const run = await prisma.ingestRun.create({ data: { retailer: client.slug } });
    try {
      const result = await fillStore(client, wanted, async (o) => {
        await recordOffer(prisma, retailer.id, { ...o, source: `${client.slug}:cross-ean` }, run.id);
      });
      await prisma.ingestRun.update({
        where: { id: run.id },
        data: {
          status: "ok", finishedAt: new Date(), itemsSeen: result.found,
          error: `cross-fill: ${wanted.length} EANs asked${result.unchecked.length ? `, ${result.unchecked.length} unchecked: ${result.unchecked.slice(0, 50).join(" ")}` : ""}`,
        },
      });
      console.log(`[cross-fill] ${client.slug}: ${result.found} found of ${wanted.length} EANs, ${result.unchecked.length} unchecked, in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      await prisma.ingestRun.update({ where: { id: run.id }, data: { status: "error", finishedAt: new Date(), error: `cross-fill: ${String(error)}` } });
      console.error(`[cross-fill] ${client.slug} failed`, error);
    }
  }
}
