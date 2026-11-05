# DeUna catalogue API (v1)

A small service-to-service API so DeUna (rural delivery, separate repo) can read each supermarket's
online catalogue with Rinde's latest observed prices for its "mandado" (errand) orders. Read only.
Each item links to the store's own product photo. Responses carry no descriptions and nothing about
Rinde's users; receipt (community) prices are never included.

- Host: the Rinde API, `https://rinde-api.cool.chuventures.com` (the `web` service, `apps/web`).
- Code: `apps/web/src/app/api/deuna/v1/`, logic in `apps/web/src/server/deuna.ts`.
- Tests: `apps/web/src/server/deuna.int.test.ts` (dev DB), `deuna.test.ts` (unit).

## Auth

Every request sends `x-api-key: <key>`. The server compares it in constant time against
`DEUNA_API_KEY`, which holds one key or several separated by commas (add the new key, move DeUna to
it, then drop the old one).

| Case | Status |
|---|---|
| `DEUNA_API_KEY` unset or empty on the server | `503` `{ "error": "unavailable" }` (fails closed) |
| Header missing or not one of the keys | `401` `{ "error": "unauthorized" }` |

There is no per-key rate limit: Rinde has no shared limiter helper to reuse. Keep DeUna's calls cached.

## Responses

Successful responses send `Cache-Control: private, max-age=300`; errors send `no-store`.
Errors are `{ "error": code, "message": string, "issues"?: ZodIssue[] }`.

### `GET /api/deuna/v1/stores`

```json
{ "stores": [{ "id": "jumbo", "name": "Jumbo", "productCount": 2153, "lastIngestedAt": "2026-10-28T18:22:23.729Z" }] }
```

- `id`: `d1` | `jumbo` | `exito` | `carulla` (Rinde's retailer slugs). Only stores Rinde has switched
  on are listed (Éxito needs `INGEST_EXITO=1`, the production default).
- `productCount`: listings whose latest online observation is for sale.
- `lastIngestedAt`: when the store's last successful nightly snapshot finished, or `null`.

### `GET /api/deuna/v1/stores/:storeId/products?q=&category=&cursor=&limit=`

```json
{
  "items": [{
    "sku": "314031", "ean": "7702001023456", "name": "Arroz Diana 1 kg", "brand": "Diana",
    "size": "1 kg", "category": "Arroz", "referencePriceCop": 5200, "observedAt": "2026-10-28T18:02:11.000Z",
    "imageUrl": "https://exito.vteximg.com.br/arquivos/ids/1234567-400-400/arroz-diana.jpg"
  }],
  "nextCursor": "eyJtIjoicSIs..."
}
```

- `q` (optional, 2–100 chars, at least one word of 2+ letters): Rinde's catalog search. Every word,
  singularized and accent-insensitive, must be in the name; names starting with the first word
  come first, then cheapest, then `sku`. Without `q`: alphabetical by name, then `sku`.
- `category` (optional): the store's own category name (e.g. `Arroz`), ignoring case and accents.
- `limit`: 1–50, default 20.
- `cursor`: the previous page's `nextCursor`, sent with the same `q` and `category`. Opaque; `null`
  on the last page. A cursor from a search can't continue a browse (and vice versa): `400`.
- Unknown `storeId`: `404`. Bad parameters: `400` with `issues`.

Values above are illustrative. Item fields:

| Field | Meaning |
|---|---|
| `sku` | The store's own product id (Rinde's `RetailerProduct.externalId`), unique per store |
| `ean` | Barcode, or `null` |
| `name` | The store's product name |
| `brand`, `category` | As the store lists them, or `null` |
| `size` | Package size for people, es-CO: `"500 g"`, `"1 kg"`, `"1,5 L"`, `"6 und"`; `null` when unknown |
| `referencePriceCop` | Integer COP from the latest online observation. A reference only: DeUna re-quotes before charging |
| `observedAt` | When that price was read (ISO 8601). No age cut-off is applied; check it |
| `imageUrl` | The store's own product photo on its VTEX image host, sized 400 × 400 (https), or `null`. A link to the store's image, not a copy: show it as that store's product photo |

Only listings whose latest online observation is available are returned; a product that sold out on
its latest check disappears until it is seen for sale again.

### `GET /api/deuna/v1/stores/:storeId/products/:sku`

One item as above, or `404` when the store is unknown or it has no current price for that `sku`.

## Example

```bash
curl -s -H "x-api-key: $DEUNA_API_KEY" \
  "https://rinde-api.cool.chuventures.com/api/deuna/v1/stores/d1/products?q=arroz&limit=10"
```
