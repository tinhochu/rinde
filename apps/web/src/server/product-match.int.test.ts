import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, ensureRetailer, recordOffer, type RetailerSlug } from "@rinde/db";
import { listingsByEan } from "./offers";
import { matchLines } from "./receipt-match";

const RUN = `${Date.now()}`;
// Not real barcodes: one product, carried under a different barcode at D1.
const JUMBO_EAN = `98${RUN.slice(-11)}`;
const D1_EAN = `97${RUN.slice(-11)}`;
const NAME = `Leche Zqxwv ${RUN} (1000 ml)`;

const offer = (slug: RetailerSlug, ean: string, price: number) => ({
  retailer: slug, externalId: `test-${slug}-${RUN}`, name: NAME, brand: "Zqxwv", ean, category: "Leche",
  size: { amount: 1000, unit: "ml" as const }, price, listPrice: price, available: true, stock: 10,
  url: `https://example.test/${slug}`, imageUrl: null, source: `${slug}:vtex-catalog`,
  sourceUrl: `https://example.test/${slug}/search`, observedAt: new Date(),
});

describe.skipIf(!process.env["INTEGRATION"])("lookups by barcode follow a product match (dev DB)", () => {
  let shared = "";
  let d1Listing = "";

  beforeAll(async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    const d1 = await ensureRetailer(db(), "d1");
    await recordOffer(db(), jumbo.id, offer("jumbo", JUMBO_EAN, 4200));
    const own = await recordOffer(db(), d1.id, offer("d1", D1_EAN, 3900));
    shared = (await db().product.findUniqueOrThrow({ where: { ean: JUMBO_EAN } })).id;
    const listing = await db().retailerProduct.findUniqueOrThrow({ where: { id: own.retailerProductId }, select: { id: true, productId: true } });
    d1Listing = listing.id;
    // What a match does: the D1 listing moves to the shared product, and the row remembers where it came from.
    await db().retailerProduct.update({ where: { id: listing.id }, data: { productId: shared } });
    await db().productMatch.create({ data: { retailerProductId: listing.id, fromProductId: listing.productId, toProductId: shared, by: "muse", reason: "Misma leche" } });
  });

  afterAll(async () => {
    const products = await db().product.findMany({ where: { ean: { in: [JUMBO_EAN, D1_EAN] } }, select: { id: true } });
    const ids = products.map((p) => p.id);
    await db().productMatch.deleteMany({ where: { OR: [{ fromProductId: { in: ids } }, { toProductId: { in: ids } }] } });
    await db().priceObservation.deleteMany({ where: { retailerProduct: { productId: { in: ids } } } });
    await db().retailerProduct.deleteMany({ where: { productId: { in: ids } } });
    await db().product.deleteMany({ where: { id: { in: ids } } });
  });

  it("keeps a re-pointed listing on the shared product when the store reports it again", async () => {
    const d1 = await ensureRetailer(db(), "d1");
    await recordOffer(db(), d1.id, offer("d1", D1_EAN, 3800));
    expect((await db().retailerProduct.findUniqueOrThrow({ where: { id: d1Listing } })).productId).toBe(shared);
  });

  it("puts a new listing with the old barcode on the shared product", async () => {
    const carulla = await ensureRetailer(db(), "carulla");
    const obs = await recordOffer(db(), carulla.id, offer("carulla", D1_EAN, 4500));
    expect((await db().retailerProduct.findUniqueOrThrow({ where: { id: obs.retailerProductId } })).productId).toBe(shared);
  });

  it("finds the shared product's listings from either barcode", async () => {
    for (const ean of [JUMBO_EAN, D1_EAN]) {
      const stores = (await listingsByEan([ean], ["d1", "jumbo", "carulla"])).map((r) => r.slug).sort();
      expect(stores).toEqual(["carulla", "d1", "jumbo"]);
    }
  });

  it("matches a receipt line printed with the old barcode to the D1 listing", async () => {
    const [result] = await matchLines("d1", "D1", [{ index: 0, kind: "item", text: "LECHE ZQXWV 1000ML", code: D1_EAN, quantity: null, unitPrice: 3800, total: 3800 }]);
    expect(result?.match).toMatchObject({ listingId: d1Listing, by: "ean" });
  });
});
