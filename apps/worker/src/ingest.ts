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
    for (const term of terms) {
      for (const o of await client.search(term, { limit: PAGE_SIZE })) offers.set(o.externalId, o);
    }

    for (const o of offers.values()) {
      await recordOffer(prisma, retailer.id, o, run.id);
      seen++;
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { status: "ok", finishedAt: new Date(), itemsSeen: seen },
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
  const includeExito = process.env["INGEST_EXITO"] === "1";
  for (const client of retailers({ includeExito })) {
    const started = Date.now();
    try {
      const n = await ingestRetailer(client);
      console.log(`[ingest] ${client.slug}: ${n} offers in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      console.error(`[ingest] ${client.slug} failed`, error);
    }
  }
}

// `pnpm ingest` runs a single snapshot and exits.
if (import.meta.url === `file://${process.argv[1]}`) {
  await ingestAll();
  await db().$disconnect();
}
