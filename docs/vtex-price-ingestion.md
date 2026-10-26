# Rinde — Price ingestion via public VTEX endpoints

Status: verified live against all three retailers on 2026-10-26.
Related brief sections: §5 (stack, AI responsibilities), §6 (entities), §7 (data acquisition).

## 1. How the requests work

All three retailers run on VTEX and expose **unauthenticated JSON catalog APIs**.
No API keys, no login — plain HTTPS GET with a browser `User-Agent`.

**Pacing (required):** ≥2s between requests, retry with backoff on empty bodies
or 5xx. Jumbo returned transient empty responses under rapid-fire probing;
paced retries all returned HTTP 200.

### Endpoints

**Éxito** (`https://www.exito.com`, VTEX FastStore) — Intelligent Search:

```
GET /api/io/_v/api/intelligent-search/product_search?_from=0&_to=49&query=arroz%20diana
```

Legacy catalog also works but issues a redirect — follow it (`curl -L`):

```
GET /api/catalog_system/pub/products/search?ft=arroz%20diana&_from=0&_to=49
```

**Jumbo** (`https://www.jumbocolombia.com`, VTEX IO) — same two APIs:

```
GET /api/io/_v/api/intelligent-search/product_search?_from=0&_to=49&query=arroz%20diana
GET /api/catalog_system/pub/products/search?ft=arroz%20diana&_from=0&_to=49
```

Do NOT use `tiendasjumbo.co` — broken TLS certificate, 301s to the domain above.

**D1** (`https://www.d1.com.co`, VTEX IO) — legacy catalog (verified):

```
GET /api/catalog_system/pub/products/search?ft=arroz%20diana&_from=0&_to=49
```

### Parameters

- `query=` (Intelligent Search) or `ft=` (legacy): URL-encoded full-text search.
- `_from=` / `_to=`: zero-based pagination window. Keep windows ≤50.
- Always send `User-Agent: Mozilla/5.0 ...` (browser string).

### Example

```bash
curl -s -A "Mozilla/5.0" \
  "https://www.exito.com/api/io/_v/api/intelligent-search/product_search?_from=0&_to=4&query=arroz%20diana"
```

## 2. What each response gives (field map)

Both API shapes return everything the `Product` + `PriceObservation` entities need:

- **Identity:** `productId`, `productName`, `brand`, `link` (product page URL),
  `items[].ean` — the EAN barcode, the cross-store join key for GTIN matching.
- **Price (Intelligent Search):** `priceRange.sellingPrice.lowPrice` (+ `listPrice`).
- **Price (legacy):** `items[].sellers[0].commertialOffer.{Price, ListPrice}`.
- **Images:** `items[].images[].imageUrl` — CDN URLs, hotlinkable, no re-hosting
  needed for the MVP (verified on all three stores).
- **Availability:** `commertialOffer.{IsAvailable, AvailableQuantity}` — real stock
  signal (e.g. Jumbo reported 85 units on one SKU).
- **Taxonomy + size:** `categories[]`, `categoryId`, `specificationGroups[]`
  (units such as `KILOGRAMO`, `Factor Neto PUM`) — inputs to quantity normalization.
- **Freshness:** stamp `observed_at` server-side at fetch time; honor
  `commertialOffer.PriceValidUntil` when present.

Known quirk: the "same" product is named differently per store
(Éxito `blanco vitamor` vs Jumbo `blanco`), so exact-name joins fail —
normalization (brief Day 3) must use EAN first, AI-normalized name second.

## 3. How the PWA gets images, prices, and "where to buy"

The PWA **never calls VTEX directly**. All retailer traffic goes through the
NestJS ingestion service: one polite, cached, rate-limited fetcher instead of
one per user session (avoids CORS issues, IP throttling, and ToS exposure).

```
PWA (Next.js) → NestJS API → Postgres (Prisma)
                      ↕ BullMQ ingestion worker → VTEX endpoints (3 retailers)
```

**Images:** the worker persists `imageUrl` per product. The PWA renders them
straight from the retailer CDNs via `next/image` remote patterns:

- `exitocol.vtexassets.com`
- `jumbocolombiaio.vteximg.com.br`
- `d1tiendas.vteximg.com.br`

**Prices:** the PWA reads only the NestJS API (`GET /basket/optimize`), which
returns each item with per-store observed prices plus `observed_at`. The UI
labels every price `online · verified {relative time}`. Prices older than the
refresh window render with a stale flag and trigger a background re-fetch.

**Where to buy:** the optimizer assigns each list item to a store using only
observed prices (AI never invents a price). MVP outputs both modes:

1. **Single-store:** cheapest total if the whole basket is bought at one retailer.
2. **Split-basket:** cheapest total allowing per-item store assignment,
   with the number of stops shown explicitly.

Unavailable items (no offer, `IsAvailable=false`, or no match) are listed
separately with the reason — never silently dropped or priced by guess.

**Refresh:** scheduled worker re-fetches demo-basket terms (e.g. every 6h) plus
on-demand refresh when a user runs an optimization on stale data.

## 4. Catalog size and crawl strategy (2026-10-26)

Measured whole-store catalog sizes (all departments, not just grocery):

- **D1:** ~2,000 products (2 sitemap shards × 1,000).
- **Jumbo:** ~47,000 products (47 sitemap shards × 1,000).
- **Éxito:** ~1,067,000 records (`recordsFiltered`, no-query search —
  includes third-party marketplace sellers and all departments).

Full-catalog download math at 50 products/request and 2s pacing:

- D1: ~40 requests, ~2 minutes. Trivially mirrorable in full.
- Jumbo: ~940 requests, ~30–45 minutes. Feasible but wasteful.
- Éxito: ~21,300 requests, ~12+ hours, high throttling/blocking risk —
  and mostly non-grocery marketplace noise.

Verdict: **do not full-crawl.** Rinde uses demand-driven ingestion instead:

1. Fetch only what users put on shopping lists, cached by EAN/normalized name.
2. Seed with a curated staple-term list (~200–500 terms × 3 stores).
3. Pull substitution candidates from same-category siblings of requested items.
4. Scope category crawls to grocery departments (`Mercado`/`Supermercado`).
5. Refresh cached observations on a schedule; never serve a price without
   its `observed_at`.

Full-catalog pulls are also unreliable through these endpoints (deep-pagination
limits, duplicates, stale prices within hours) and carry the highest ToS and
IP-blocking exposure.

## 5. Reliability + compliance guardrails

- Pin the Jumbo domain; follow redirects on Éxito legacy; paginate ≤50.
- Rate-limit, cache observations, backoff on failures.
- All three `robots.txt` permit `/api/` (only account/checkout/internal paths
  are disallowed) — still, review each retailer's terms before scaling past
  the hackathon demo.
- Every displayed price carries source store + online-channel label + timestamp.
- Demo-day insurance: keep a dated snapshot of fetched observations; if live
  fetch fails on stage, serve the snapshot clearly labeled with its date
  (per brief §7, never present it as live).
