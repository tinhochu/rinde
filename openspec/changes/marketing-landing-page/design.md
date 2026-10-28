# Design

## Context

- **Hosting today.** The app is the Expo web export, served by a separate nginx image (`rinde-app:<sha>`) at `rinde.cool.chuventures.com`. That image's Dockerfile and nginx.conf live outside the repo.
  - Its manifest uses `start_url` and `scope` `/`.
  - `public/sw.js` serves navigations network-first and caches `/_expo/static` and `/assets` cache-first.
- **On-device state.** All app data is in `localStorage` under `rinde-*` keys (AsyncStorage on web): session, cart, favorites, preferences, draft, searches, picks, seen badges, theme, linked user, install-dismissed.
- **The API** (`rinde-api.cool.chuventures.com`):
  - allows origins from `CORS_ORIGINS`, which also feeds Better Auth `trustedOrigins`;
  - takes reply links from `APP_URL`;
  - `GET /api/catalog?query=` returns `products[]` with `offers[]` (store, price, observedAt), cross-store `spread`, and `checkedAt`.
- **DNS.** `app.rinde.cool.chuventures.com` already resolves to the server through the wildcard record.
- **The server is shared and crowded**, so images must stay tiny.

## Goals / Non-Goals

**Goals:**
- A landing site that is a few static files.
- A move of the app's origin that loses nobody's session or points.
- No change to the API's code.

**Non-Goals:**
- No CMS or blog.
- No analytics or tracking.
- No account features on the landing page.
- No server-side rendering.
- No native app store links.
- No new API endpoint.

## Decisions

**1. `apps/landing` is plain static HTML/CSS plus one small ES module, with no framework and no build step.**
- `index.html` (es) and `en/index.html` are written by hand from one shared structure.
- `styles.css`, `compare.js`, `handoff.js`, the OG images and the favicon sit next to them.
- A tiny `node --test` checks: both pages have the same section ids, no digits that look like prices appear in the HTML, and the hreflang/OG tags are present.
- *Alternatives:*
  - Astro or Next static export: nicer templating, but adds a toolchain for two pages.
  - A route inside the Expo app: would ship the app bundle and break the "loads before script" rule.
- Two hand-kept files are acceptable at this size, and the test guards drift.

**2. Live comparison: one browser-side `GET /api/catalog` per staple, run in order.**
- Staples, tried in order: `huevos`, `arroz`, `leche`, `aceite`. The page takes the first product with offers from ≥2 stores, preferring the largest `spread`.
- Requests stop at the first hit, with an overall 4 s `AbortController` budget.
- Prices are rendered with `Intl.NumberFormat('es-CO', {currency:'COP', maximumFractionDigits:0})` from the integer returned. Ages use `Intl.RelativeTimeFormat` in the page language.
- Nothing is written to storage. The placeholder in the HTML is explanatory text with no numbers.
- *Alternative:* bake prices in at deploy time. Rejected: they go stale and break the "never stored in the page" rule.
- The landing origin is added to `CORS_ORIGINS`. That also makes it a Better Auth trusted origin, which is harmless because the landing page never calls auth.

**3. One nginx image, `rinde-landing`, does all root-domain routing.** It is built `FROM nginx:stable-alpine-slim`, with config in `apps/landing/nginx.conf`:
- **App paths:** `^/(cart|favorites|plan|profile|account|contributions|product/|receipt|search|_expo/|assets/|manifest\.json)` gets a 301 to `https://app.rinde.cool.chuventures.com$request_uri`. The app host (`APP_ORIGIN`) is filled in at image build time, like the origins in the HTML. The slim nginx image has no `envsubst`, so the `templates/` mechanism isn't available.
- **`/sw.js`** is served from the landing, `no-cache`. This is the replacement worker (decision 5).
- **Landing pages:**
  - `/` and `/en/` get `Cache-Control: no-cache`;
  - hashed-name static assets get `max-age=31536000, immutable` (file names carry a short content hash, added by a tiny copy script in the Dockerfile).
- **Handoff:** no separate handoff page; it runs inside the landing pages themselves (decision 4).

**4. Installed-app forward and data handoff run in an inline `<head>` script on the landing pages, before paint.**
- If `matchMedia('(display-mode: standalone)').matches` or `navigator.standalone`, the script:
  - collects every `localStorage` key starting with `rinde-` (unless `rinde-handoff-done` is set);
  - encodes them as base64url JSON into the **URL fragment**: `location.replace(APP + '/#rinde-handoff=' + data)`;
  - sets `rinde-handoff-done` with a timestamp.
- The fragment never reaches a server or its logs (spec: no server, not in the query). The same handoff is added to "Abrir Rinde" clicks for normal browser visitors who have old data. The landing page's own keys (language hint) don't use the `rinde-` prefix.
- **App side:** an inline script in `apps/mobile/public/index.html` runs before the bundle, so before anything reads storage:
  - it reads `#rinde-handoff`;
  - if the app's `rinde-session` is absent, it writes each key, otherwise it ignores the whole handoff;
  - it then clears the fragment with `history.replaceState` and sets `rinde-moved-notice`, which shows a one-time card: "Rinde ahora vive en app.rinde… Instálala de nuevo desde aquí."
- Keys larger than 64 KB in total are trimmed: searches and picks are dropped first; the session and cart always go.
- After 30 days, the landing script deletes the old `rinde-*` keys.
- *Alternatives:*
  - An iframe with postMessage: Safari partitions third-party storage, so it is unreliable.
  - A server-side transfer token: violates "not sent to the server".

**5. A replacement service worker on the root domain.**
- The new `/sw.js`:
  - installs with `skipWaiting`;
  - on activate, deletes every Cache Storage entry, claims clients, and has no fetch handler (so the network serves everything).
- Browsers update a registered worker's script on navigation (`sw.js` is `no-cache`), so old installs pick it up on the next visit.
- The landing page does not register a worker for new visitors. The script only re-registers `/sw.js` if `navigator.serviceWorker.controller` exists, which lets the update happen.

**6. The app image moves to its own subdomain without code changes.**
- The `app` service's Coolify domain becomes `https://app.rinde.cool.chuventures.com`. The manifest's relative `start_url`/`scope` stay `/`, which is correct per origin.
- The PWA Dockerfile/nginx.conf move into the repo at `apps/mobile/deploy/`.
- New `landing` service in the compose: `rinde-landing:<sha>`, domain `https://rinde.cool.chuventures.com`, `APP_ORIGIN` env.
- API env changes:
  - `CORS_ORIGINS=https://app.rinde.cool.chuventures.com,https://rinde.cool.chuventures.com`;
  - `APP_URL=https://app.rinde.cool.chuventures.com`.

**7. Visual direction.**
- **Built from Rinde's own world:** the receipt (tirilla) and the market aisle, not a SaaS template.
- **Palette:**
  - app tokens: forest `#173E25`, primary `#21734D`, background `#FCFAF8`, receipt paper `#FFF9EF`, accent `#DD6D27`;
  - dark-scheme equivalents from `lib/theme.ts`.
- **The memorable element:** the live comparison set as a printed receipt strip in the hero (monospaced receipt numerals only there), with the cheapest store stamped.
- Everything else stays quiet: one sans family served locally as a subset WOFF2 (~20 KB), left-aligned text, sentence case, no uppercase eyebrows, no card grid.
- The how-it-works section is a real sequence (search → plan → send receipt), so numbered steps are justified there.
- Exact type choice and layout are settled during apply, with screenshots at 360 px and 1280 px.

## Risks / Trade-offs

- **[Old installs on iOS cache the start page aggressively]** → The forward runs in an inline head script, and HTML is `no-cache`. iOS standalone apps relaunch from network after being killed, and the replacement SW clears caches. Worst case: the user reinstalls from the app domain, as the one-time notice says.
- **[Handoff fragment too long for some browsers]** → Capped at 64 KB, with low-value keys dropped first. Chrome and Safari accept URLs far longer.
- **[Two Spanish/English HTML files drift apart]** → A test compares section ids and required meta between them.
- **[The catalog has no two-store staple at demo time]** → The page degrades to text. During apply, verify against production that `huevos` returns ≥2 stores (eggs are grouped across brands since `ca03465`).
- **[A Google OAuth client with an origin allowlist]** → If Google sign-in is configured, add the new origin in Google Cloud console. This is a manual step listed in tasks.
- **[Sign-in session on the API domain]** → The Better Auth cookie is set by the API host, not the app origin, so signed-in users stay signed in after the move once the origin is trusted.

## Migration Plan

1. Deploy the API env change first (adds the new origins, keeps the old one valid for the transition): `CORS_ORIGINS` gets the root and the app subdomain.
2. Build and push `rinde-app:<sha>` (with the handoff module) and `rinde-landing:<sha>` on the server.
3. In one compose PATCH:
   - the app domain becomes `app.rinde…`;
   - the landing service is added on `rinde…`;
   - `APP_URL` is set.
   Then restart.
4. Verify:
   - landing ES/EN;
   - live comparison;
   - `/receipt/x` gets a 301;
   - standalone forward and handoff, with a Chrome emulated install;
   - sign-in on the app subdomain;
   - old images removed (only `rinde-*`).

**Rollback:** restore the previous compose (the app back on the root domain, no landing service). Handed-off data stays on both origins, so nothing is lost.

## Open Questions

- Final copy wording in both languages is written during apply and reviewed by the user in screenshots.
- Whether to use a short custom domain later (for example `rinde.co`). `APP_ORIGIN` and the env values make that a configuration change.
