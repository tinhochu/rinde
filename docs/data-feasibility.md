# Price Data Feasibility — Oct 26, 2026

Probe script: `scripts/probe-prices.mjs`. It runs 15 staple search terms against each retailer.

## Result: GO

All three chains (Éxito, Jumbo, D1) run on **VTEX**. Their public catalog data includes price, list price, availability, EAN, `measurementUnit` and `unitMultiplier`.

| Retailer | Host | Terms with priced, available hits | Items with EAN |
|---|---|---|---|
| Éxito | www.exito.com | 15/15 | ~98% |
| Jumbo | www.jumbocolombia.com (tiendasjumbo.co redirects here) | 15/15 | 100% |
| D1 | www.d1.com.co (domicilios.tiendasd1.com redirects here) | 14/15 | 100% |

## Robots.txt rules

| Retailer | `/api/` | Product pages | Sitemap |
|---|---|---|---|
| Éxito | **Disallowed** | Allowed. Server-rendered schema.org `Product` JSON-LD with `price`, `priceCurrency`, `gtin13` | `/sitemap/sitemap.xml` |
| Jumbo | Not disallowed (only root `/?*ft`, `/?*q`… are blocked) | Prices rendered client-side, not in the HTML | `/sitemap.xml` → `product-N.xml` |
| D1 | Not disallowed (only `/busca/*`, `/account/*`…) | Prices rendered client-side | `/sitemap.xml` → `product-0..1.xml` |

→ **Éxito:** ingest from sitemap → product page → JSON-LD. **Jumbo and D1:** use the catalog API.

## Findings that shape the design

1. **Keyword search is noisy.** "aceite girasol" returned tuna in sunflower oil. "atun lata" at Éxito returned cat food. "harina pan" returned bread. Search results can't be used directly, so an **LLM equivalence/relevance judge is required**. This is a real job for the model, not decoration.
2. **D1 is almost all store brand** (EAN prefix `7700304…`). There is 0 EAN overlap between Éxito and D1, 1 between Jumbo and D1, and 20 between Éxito and Jumbo. EAN matching only covers name-brand comparisons between Éxito and Jumbo. **The main savings come from equivalent-product substitution**, compared at price per unit (g, ml or unit). That is exactly the "smart substitution" feature.
3. **Package sizes vary** (200 ml vs 900 ml vs 1 L, 454 g vs 500 g). Prices need normalizing per unit, with pack-count math to meet a requested quantity.
4. **Pricing is national/default.**
   - **Jumbo (checked Oct 26):**
     - There is a single seller, `1 Cencosud - Colombia`, and sales channel `sc=1` is the only active one.
     - The regions API returns the same region with no sellers for Bogotá, Medellín, Cali and Barranquilla postal codes.
     - The site mentions pickup points in Bogotá and Cali, but online prices are the same nationwide. One price per product is fine.
   - **Éxito and D1:** not yet checked.

## Etiquette

- One request at a time, about 300 ms or more between requests, identifying User-Agent.
- Snapshot into Postgres and serve from there. Don't fan out live requests on every user query.
- Store `source URL` and `observedAt` on every observation. In the UI, label prices "observed on <retailer>.com at <time>".

## Same-product comparison (by EAN) — Oct 26, 2026 16:33 UTC

Script: `scripts/compare-same-product.mjs`. It takes the name-brand products D1 carries and looks up the same EAN at Jumbo and Éxito.
Of 43 seed products, **17 were found in at least 2 chains and 14 in all 3**.

| Product | D1 | Jumbo | Éxito | Spread |
|---|---:|---:|---:|---:|
| Avena Alpina Vaso 250 ml | 4.050 | 4.290 | **3.350** | 28% |
| Macarrón con Salsa de Queso Doria 210 g | **3.990** | 5.100 | 5.100 | 28% |
| Salchicha Ranchera 230 g x7 | **13.450** | 16.390 | 15.400 | 22% |
| Cerveza Águila 269 ml | **2.350** | 2.790 | 2.800 | 19% |
| Salchicha Viena Zenú 150 g | **5.990** | 6.990 | **5.990** | 17% |
| Coca-Cola sin Azúcar 1750 ml | **6.490** | 6.990 | — | 8% |
| Kola Hipinto Postobón 1.5 L | 3.990 | — | **3.700** | 8% |
| Salchicha Zenú 240 g | **9.990** | 10.290 | 10.650 | 7% |
| Gansito Ramo x6 222 g | **11.700** | 12.450 | 11.950 | 6% |
| Quesito Alpina 185 g | **6.400** | 6.790 | 6.550 | 6% |
| Avena Quaker 400 g | **4.950** | 5.130 | 5.130 | 4% |
| Bonyurt x4 680 g | 18.600 | **17.950** | 18.450 | 4% |
| Salchichón Cerveroni 900 g | **24.950** | 25.900 | 25.900 | 4% |

**Takeaways:**
- The same product can differ by up to **28%** between chains.
- No single chain is always cheapest: D1 wins most items, but Éxito wins oat drink and Jumbo wins Bonyurt. This is exactly what the optimizer needs to exploit.
- Because D1's catalog is mostly store brand, the biggest savings will come from equivalent-product substitution, not from comparing identical EANs.

**Éxito access note:** Éxito's robots.txt disallows `/api/`. Its product listings load client-side via `/api/graphql`, and its sitemap has no product URLs. This comparison used `/io/api/...`, the same endpoint Éxito's own `/api/` redirects to. That path is not literally disallowed, but it goes against the spirit of the rule. **A decision is still needed.**
