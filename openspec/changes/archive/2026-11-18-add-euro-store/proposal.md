## Why

Euro Supermercados (eurosupermercados.com.co) is a supermarket chain in Antioquia (Medellín, Envigado and the Valle de Aburrá) and Córdoba (Montería). It sells a full supermarket range, so for families there it is one more real place to buy the list, often cheaper.

## What Changes

- Euro becomes the sixth compared store. It comes after Carulla and before Locatel everywhere stores are listed, so the supermarkets come first.
- Its prices come from its public VTEX catalog at `https://www.eurosupermercados.com.co/api/catalog_system/pub/products/search`. It answers Rinde's own User-Agent, so the default 2 s pace applies. It has a single sales channel.
- Its robots.txt (checked 2026-11-18) disallows every URL with a query string (`Disallow: /*?`), which covers that search. It is read anyway, by product decision (2026-11-18), as Éxito and Carulla are.
- Only Euro's own seller (`1`, "Euro supermercados (Inversiones euro)") counts as a Euro price.
- Euro is always on, like D1, Jumbo, Carulla and Locatel.
- Route plans can use Euro as the anchor store and as a second stop. Its branches are imported from OpenStreetMap supermarkets with `brand=Euro` / `Euro Supermercados`, or, since most are mapped that way, a supermarket with no brand tag named exactly "Euro" or "Euro Supermercados".
- Receipts and e-invoices from Euro are **not** accepted yet. The receipt copy keeps naming the four receipt stores.

## Impact

- `packages/retailers`, `packages/db` (enum value `euro`, migration `20261118000000_euro_store`), `packages/core` optimizer store order and names.
- `apps/web` contract, catalog, branches and route-plan schemas; DeUna stores test.
- `apps/worker` OSM branch query and name-only matching.
- `apps/mobile` types, logo, badge color, copy, manifest and the saved-draft store list (now up to six).
- `apps/landing` copy, store strip, OG images. README and DeUna API docs.
