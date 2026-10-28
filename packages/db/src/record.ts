import type { PrismaClient, RetailerSlug } from "./generated/prisma/client";

/** Structural shape of a retailer offer (mirrors `Offer` in @rinde/retailers). */
export interface ObservedOffer {
  retailer: RetailerSlug;
  externalId: string;
  name: string;
  brand: string | null;
  ean: string | null;
  category: string | null;
  size: { amount: number; unit: "g" | "ml" | "unit" } | null;
  price: number;
  listPrice: number | null;
  available: boolean;
  stock: number | null;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceUrl: string;
  observedAt: Date;
}

export const RETAILERS: Record<RetailerSlug, { name: string; baseUrl: string }> = {
  d1: { name: "D1", baseUrl: "https://www.d1.com.co" },
  jumbo: { name: "Jumbo", baseUrl: "https://www.jumbocolombia.com" },
  exito: { name: "Éxito", baseUrl: "https://www.exito.com" },
  carulla: { name: "Carulla", baseUrl: "https://www.carulla.com" },
};

const D1_PRIVATE_LABEL_PREFIX = "7700304";

export async function ensureRetailer(prisma: PrismaClient, slug: RetailerSlug) {
  return prisma.retailer.upsert({
    where: { slug },
    create: { slug, ...RETAILERS[slug] },
    update: {},
  });
}

/**
 * Upsert product + retailer listing and append a price observation.
 * Observations are append-only: every price shown to users traces back to one.
 */
export async function recordOffer(prisma: PrismaClient, retailerId: string, o: ObservedOffer, ingestRunId?: string) {
  const productData = {
    ean: o.ean, name: o.name, brand: o.brand, category: o.category,
    size: o.size?.amount ?? null, unit: o.size?.unit ?? null,
    isPrivateLabel: o.retailer === "d1" && Boolean(o.ean?.startsWith(D1_PRIVATE_LABEL_PREFIX)),
  };
  const product = o.ean
    // The latest size read wins, so a fixed parser or newer store metadata corrects old rows on re-ingest.
    ? await prisma.product.upsert({
        where: { ean: o.ean }, create: productData,
        update: o.size ? { size: o.size.amount, unit: o.size.unit } : {},
      })
    : await prisma.product.create({ data: productData });
  // A barcode whose listing was matched to another product (see ProductMatch) lands on that product.
  const matched = o.ean ? await prisma.productMatch.findFirst({ where: { fromProductId: product.id }, select: { toProductId: true } }) : null;

  const listing = await prisma.retailerProduct.upsert({
    where: { retailerId_externalId: { retailerId, externalId: o.externalId } },
    create: {
      retailerId, productId: matched?.toProductId ?? product.id, externalId: o.externalId,
      name: o.name, url: o.url, imageUrl: o.imageUrl, lastSeenAt: o.observedAt,
    },
    update: { name: o.name, url: o.url, imageUrl: o.imageUrl, lastSeenAt: o.observedAt },
  });

  return prisma.priceObservation.create({
    data: {
      retailerProductId: listing.id, price: o.price, listPrice: o.listPrice, available: o.available,
      stock: o.stock, source: o.source, sourceUrl: o.sourceUrl, observedAt: o.observedAt, ingestRunId,
    },
  });
}
