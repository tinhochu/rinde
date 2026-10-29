# Proposal

## Why

Carulla is a big grocery chain in Colombia's cities, and many of our users shop there. Today Rinde rejects its receipts and e-invoices and never shows its prices. It shares Éxito's catalog, so the same products match for free. But it keeps its own price list. In a check on 2026-10-28, of 250 products sold by both stores:

- 33% had the same price;
- 56% were dearer at Carulla;
- 10% were cheaper at Carulla.

When the prices differed, the median gap was +4.4%, and some gaps reached ±40–50%. So Carulla's prices are real, separate information that is worth comparing.

The same check found a pricing bug. For about 13% of Carulla items and 22% of Éxito items, the price we would read comes from a third-party marketplace seller, not the store itself.

## What Changes

- Carulla becomes the fourth store everywhere the app names stores:
  - catalog ingest;
  - search and comparisons;
  - the trip planner and basket totals;
  - store badges in the app;
  - receipt and e-invoice intake;
  - the reply emails;
  - the landing page copy.
- Ingest reads Carulla through `www.carulla.com/io/api/...`, the same path we use for Éxito (its robots.txt disallows `/api/`, as Éxito's does). It runs at Éxito's slower pace. Carulla is always on, with no flag (product decision, 2026-10-28).
- Receipts and e-invoices from Carulla are accepted as Carulla. Both are issued by Almacenes Éxito (NIT 890900608), so the banner on the invoice decides the store. Carulla is no longer treated as a rejected sister chain. Surtimax, Super Inter and Surtimayorista stay rejected.
- Store-sold prices only: for Carulla and Éxito, an offer's price comes from the store's own seller (VTEX seller id `1`). A product that only a marketplace seller sells is treated as not available at that store. This changes which Éxito prices are shown (a fix).
- The landing page and the app's copy name four stores ("D1, Jumbo, Éxito y Carulla").
- No new prices are invented: Carulla prices are only the ones read from its site or from confirmed receipts and e-invoices.

## Capabilities

### New Capabilities
- `supported-stores`: which stores Rinde compares and where each one appears (catalog, comparisons, planner, receipts, e-invoices, copy).
- `store-catalog-ingest`: how a store's online prices are read: the path, the pace, and taking the price from the store's own seller only.

### Modified Capabilities
(none: there are no archived main specs yet. The in-flight changes `multi-store-trip-planner`, `receipt-price-rewards`, `einvoice-email-intake` and `marketing-landing-page` describe three stores. Their behavior extends to Carulla through `supported-stores` and is not rewritten here.)

## Impact

- **Database:** `RetailerSlug` enum gains `carulla`, which needs a Prisma migration. The `Retailer` row is created on first ingest.
- **`packages/retailers`:** a new `carulla` VTEX client, `RetailerSlug` type, `retailers()` / `retailerBySlug`, and an own-seller option in `vtex.ts`.
- **`packages/core`:**
  - optimizer `RetailerSlug`, `STORE_ORDER`, `STORE_NAMES` (the planner tries 15 store sets instead of 7);
  - `ReceiptStore` and `detectStore` in `receipt/parse.ts`;
  - `einvoice/stores.ts`.
- **`packages/db`:** the `RETAILERS` record.
- **`apps/worker`:** ingest (Carulla always included).
- **`apps/web`:**
  - `contract.ts` (`Store`, `STORE_BY_SLUG`, `SLUG_BY_STORE`);
  - `enabledRetailers()`;
  - the `/api/catalog` store enum;
  - reply and receipt copy.
- **`apps/mobile`:**
  - `lib/market.ts`, `lib/planner.ts`, `lib/theme.ts`, `lib/shop.ts` (the `stores` limit goes from 3 to 4);
  - `components/brand.tsx` and its store mark;
  - `verify-progress.tsx`;
  - copy that lists the stores.
- **`apps/landing`:** copy, the store strip, and prerender meta descriptions.
- **Operations:** no new setting. Production needs a migration, a redeploy, and a first Carulla ingest. The first ingest takes about as long as Éxito's, because of the 5 s pace.
