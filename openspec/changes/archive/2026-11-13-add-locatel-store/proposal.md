## Why

Locatel (locatelcolombia.com) is a Colombian health, beauty and wellness chain. It sells many of the things on a family's list that the supermarkets also sell: personal care, baby food, milk and other packaged foods. Comparing it shows when the pharmacy aisle is cheaper there.

## What Changes

- Locatel becomes the fifth compared store, after Carulla, everywhere stores are listed.
- Its prices come from its public VTEX catalog at `https://www.locatelcolombia.com/api/catalog_system/pub/products/search`. Its robots.txt (checked 2026-11-13) does not disallow `/api/`, and it answers Rinde's own User-Agent, so the default 2 s pace applies.
- Only Locatel's own seller (`1`, "LOCATEL COLOMBIA") counts as a Locatel price.
- Locatel is always on, like D1, Jumbo and Carulla.
- Route plans can use Locatel as the store the trip goes to (by the person's location or a typed address). Its branches are imported from OpenStreetMap as pharmacies, but none are mapped in Colombia yet, so it isn't offered as a second stop until they are.
- Receipts and e-invoices from Locatel are **not** accepted yet. The receipt copy keeps naming the four supermarkets.
- Éxito's logo is replaced with its current app icon.

## Impact

- `packages/retailers`, `packages/db` (enum value `locatel`, migration `20261113000000_locatel_store`), `packages/core` optimizer store order and names.
- `apps/web` contract, catalog, branches and route-plan schemas. Receipt input is narrowed to the receipt stores.
- `apps/worker` OSM branch query.
- `apps/mobile` types, logo, badge color, copy and the saved-draft store list.
- `apps/landing` copy, store strip, OG images. README.
