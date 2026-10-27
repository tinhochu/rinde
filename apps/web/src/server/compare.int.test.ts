import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, ensureRetailer, recordOffer } from "@rinde/db";
import { compareProducts } from "./compare";
import { cleanupContributors, seedConfirmedReceipt } from "./receipt-fixture";
import { produceListing } from "./receipts";

const RUN = `test-compare-${Date.now()}`;

describe.skipIf(!process.env["INTEGRATION"])("comparing receipt produce prices (dev DB)", () => {
  beforeAll(async () => {
    const tx = db() as never;
    const [d1Kg, jumboKg, d1Unit] = await Promise.all([
      produceListing(tx, "d1", "banano", "kg"), produceListing(tx, "jumbo", "banano", "kg"), produceListing(tx, "d1", "banano", "unit"),
    ]);
    await seedConfirmedReceipt({ sessionId: `${RUN}-d1`, store: "d1", hoursAgo: 6, lines: [{ listingId: d1Kg.id, price: 3600, produceSlug: "banano" }, { listingId: d1Unit.id, price: 550, produceSlug: "banano" }] });
    await seedConfirmedReceipt({ sessionId: `${RUN}-jumbo`, store: "jumbo", hoursAgo: 2, branch: "Jumbo Hayuelos", lines: [{ listingId: jumboKg.id, price: 3980, produceSlug: "banano" }] });
  });
  afterAll(() => cleanupContributors(RUN));

  it("gives a verdict between per-kg prices, none across units, and keeps both groups together", async () => {
    const { products } = await compareProducts("banano", ["d1", "jumbo"]);
    const kg = products.findIndex((p) => p.key === "produce:banano:kg");
    const unit = products.findIndex((p) => p.key === "produce:banano:unit");
    expect(kg).toBeGreaterThanOrEqual(0);
    expect(Math.abs(unit - kg)).toBe(1);

    const perKg = products[kg]!;
    expect(perKg.offers.map((o) => [o.store, o.price, o.source])).toEqual([["D1", 3600, "receipt"], ["Jumbo", 3980, "receipt"]]);
    expect(perKg.spread).toBe(380);
    expect(perKg.offers[1]!.branch).toBe("Jumbo Hayuelos");

    // D1 per unit stands alone: nothing in its unit to compare with, so no verdict against Jumbo per kg.
    expect(products[unit]!.offers.map((o) => [o.store, o.price])).toEqual([["D1", 550]]);
    expect(products[unit]!.spread).toBe(0);
  }, 60_000);
});

const ONLINE_RUN = `test-compare-online-${Date.now()}`;
const UNIQ = `pq${Date.now().toString(36)}`;
// Random (not timestamp-derived): other suites use `99${Date.now()}` EANs and share this DB.
const randEan = (prefix: string) => `${prefix}${randomUUID().replace(/\D/g, "")}`.padEnd(13, "0").slice(0, 13);
const EAN_D1 = randEan("98");
const EAN_JUMBO = randEan("97");

describe.skipIf(!process.env["INTEGRATION"])("comparing online produce across stores (dev DB)", () => {
  beforeAll(async () => {
    const prisma = db();
    const [d1, jumbo] = await Promise.all([ensureRetailer(prisma, "d1"), ensureRetailer(prisma, "jumbo")]);
    const observedAt = new Date();
    // Same 1 kg plátano under each chain's private code (different EANs, like the real catalog).
    await recordOffer(prisma, d1.id, {
      retailer: "d1", externalId: `test-produce-${ONLINE_RUN}-d1`, name: `Plátano X 1000 G ${UNIQ}`, brand: "LA HUERTA",
      ean: EAN_D1, category: "Frutas y verduras", size: { amount: 1000, unit: "g" }, price: 3100, listPrice: null,
      available: true, stock: null, url: "https://www.d1.com.co/test", imageUrl: null,
      source: "test:online-produce", sourceUrl: `rinde://test/${ONLINE_RUN}#d1`, observedAt,
    });
    await recordOffer(prisma, jumbo.id, {
      retailer: "jumbo", externalId: `test-produce-${ONLINE_RUN}-jumbo`, name: `Plátano verde ${UNIQ}`, brand: "A GRANEL",
      ean: EAN_JUMBO, category: "Frutas y verduras", size: { amount: 1000, unit: "g" }, price: 4980, listPrice: null,
      available: true, stock: null, url: "https://www.jumbocolombia.com/test", imageUrl: null,
      source: "test:online-produce", sourceUrl: `rinde://test/${ONLINE_RUN}#jumbo`, observedAt,
    });
  });
  afterAll(async () => {
    const prisma = db();
    await prisma.priceObservation.deleteMany({ where: { sourceUrl: { startsWith: `rinde://test/${ONLINE_RUN}` } } });
    await prisma.retailerProduct.deleteMany({ where: { externalId: { startsWith: `test-produce-${ONLINE_RUN}` } } });
    // Only products this run named: a shared EAN would keep the other suite's name (upsert updates nothing).
    await prisma.product.deleteMany({ where: { ean: { in: [EAN_D1, EAN_JUMBO] }, name: { contains: UNIQ } } });
  });

  it("groups the same 1kg produce by canonical item, with no false 'not carried' verdict", async () => {
    const { products } = await compareProducts(`platano ${UNIQ}`, ["d1", "jumbo"]);
    const group = products.find((p) => p.key === "produce:platano:kg");
    expect(group).toBeDefined();
    expect(group!.offers.map((o) => [o.store, o.price, o.source])).toEqual([["D1", 3100, "online"], ["Jumbo", 4980, "online"]]);
    expect(group!.spread).toBe(1880);
    expect(group!.missing).toEqual([]);
  }, 60_000);
});
