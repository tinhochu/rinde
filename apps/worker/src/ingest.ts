import { db, type RetailerSlug } from "@rinde/db";
import { retailers, type Offer, type RetailerClient } from "@rinde/retailers";
import { STAPLE_TERMS } from "./catalog";

const PAGE_SIZE = 50;

/** Snapshot the staples catalog for one retailer into Postgres. */
export async function ingestRetailer(client: RetailerClient, terms = STAPLE_TERMS) {
  const prisma = db();
  const retailer = await prisma.retailer.upsert({
    where: { slug: client.slug as RetailerSlug },
    create: { slug: client.slug as RetailerSlug, name: client.name, baseUrl: client.baseUrl },
    update: { name: client.name, baseUrl: client.baseUrl },
  });
  const run = await prisma.ingestRun.create({ data: { retailer: client.slug as RetailerSlug } });

  let seen = 0;
  try {
    const offers = new Map<string, Offer>();
    for (const term of terms) {
      for (const o of await client.search(term, { limit: PAGE_SIZE })) offers.set(o.externalId, o);
    }

    for (const o of offers.values()) {
      const product = o.ean
        ? await prisma.product.upsert({
            where: { ean: o.ean },
            create: productData(o),
            update: {},
          })
        : await prisma.product.create({ data: productData(o) });

      const listing = await prisma.retailerProduct.upsert({
        where: { retailerId_externalId: { retailerId: retailer.id, externalId: o.externalId } },
        create: {
          retailerId: retailer.id, productId: product.id, externalId: o.externalId,
          name: o.name, url: o.url, imageUrl: o.imageUrl, lastSeenAt: o.observedAt,
        },
        update: { name: o.name, url: o.url, imageUrl: o.imageUrl, lastSeenAt: o.observedAt },
      });

      await prisma.priceObservation.create({
        data: {
          retailerProductId: listing.id, price: o.price, listPrice: o.listPrice, available: o.available,
          source: o.source, sourceUrl: o.sourceUrl, observedAt: o.observedAt, ingestRunId: run.id,
        },
      });
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

function productData(o: Offer) {
  return {
    ean: o.ean, name: o.name, brand: o.brand, category: o.category,
    size: o.size?.amount ?? null, unit: o.size?.unit ?? null,
    isPrivateLabel: o.retailer === "d1" && Boolean(o.ean?.startsWith("7700304")),
  };
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
