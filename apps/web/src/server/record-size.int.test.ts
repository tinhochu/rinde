import { afterAll, describe, expect, it } from "vitest";
import { db, ensureRetailer, recordOffer } from "@rinde/db";

const RUN = `${Date.now()}`;
const EAN = `96${RUN.slice(-11)}`; // not a real barcode

const offer = (size: { amount: number; unit: "g" } | null) => ({
  retailer: "jumbo" as const, externalId: `test-size-${RUN}`, name: `Arroz Zqxwv 10 x2.5kg ${RUN}`, brand: "Zqxwv", ean: EAN,
  category: "Arroz", size, price: 9900, listPrice: 9900, available: true, stock: 10,
  url: "https://example.test/jumbo", imageUrl: null, source: "jumbo:vtex-catalog",
  sourceUrl: "https://example.test/jumbo/search", observedAt: new Date(),
});

describe.skipIf(!process.env["INTEGRATION"])("a product's size follows the latest read (dev DB)", () => {
  afterAll(async () => {
    await db().priceObservation.deleteMany({ where: { retailerProduct: { product: { ean: EAN } } } });
    await db().retailerProduct.deleteMany({ where: { product: { ean: EAN } } });
    await db().product.deleteMany({ where: { ean: EAN } });
  });

  it("corrects a misread size on re-ingest and keeps it when a read has none", async () => {
    const jumbo = await ensureRetailer(db(), "jumbo");
    await recordOffer(db(), jumbo.id, offer({ amount: 25000, unit: "g" }));
    await recordOffer(db(), jumbo.id, offer({ amount: 2500, unit: "g" }));
    expect(Number((await db().product.findUniqueOrThrow({ where: { ean: EAN } })).size)).toBe(2500);
    await recordOffer(db(), jumbo.id, offer(null));
    expect(Number((await db().product.findUniqueOrThrow({ where: { ean: EAN } })).size)).toBe(2500);
  });
});
