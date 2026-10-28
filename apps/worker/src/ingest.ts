import { db, ensureRetailer, recordOffer } from "@rinde/db";
import { retailers, type Offer, type RetailerClient } from "@rinde/retailers";
import { STAPLE_TERMS } from "./catalog";

const PAGE_SIZE = 50;

/** Snapshot the staples catalog for one retailer into Postgres. */
export async function ingestRetailer(client: RetailerClient, terms = STAPLE_TERMS) {
  const prisma = db();
  const retailer = await ensureRetailer(prisma, client.slug);
  const run = await prisma.ingestRun.create({ data: { retailer: client.slug } });

  let seen = 0;
  try {
    const offers = new Map<string, Offer>();
    const failed: string[] = [];
    for (const term of terms) {
      try {
        for (const o of await client.search(term, { limit: PAGE_SIZE })) offers.set(o.externalId, o);
      } catch (error) {
        // One throttled term shouldn't throw away the rest of the snapshot.
        failed.push(term);
        console.warn(`[ingest] ${client.slug} "${term}" failed:`, String(error));
      }
    }
    if (failed.length === terms.length) throw new Error(`${client.slug}: every search failed`);

    for (const o of offers.values()) {
      await recordOffer(prisma, retailer.id, o, run.id);
      seen++;
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { status: "ok", finishedAt: new Date(), itemsSeen: seen, error: failed.length ? `failed terms: ${failed.join(", ")}` : null },
    });
  } catch (error) {
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), itemsSeen: seen, error: String(error) },
    });
    throw error;
  }
  return seen;
}

export async function ingestAll() {
  for (const client of retailers()) {
    const started = Date.now();
    try {
      const n = await ingestRetailer(client);
      console.log(`[ingest] ${client.slug}: ${n} offers in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      console.error(`[ingest] ${client.slug} failed`, error);
    }
  }
}

// `pnpm ingest` (or `node dist/ingest.mjs`) runs a single snapshot and exits. Matched by file name, not
// import.meta.url, because the bundled worker inlines this module into dist/index.mjs.
if (/[\\/]ingest\.(ts|mjs)$/.test(process.argv[1] ?? "")) {
  await ingestAll();
  await db().$disconnect();
}
