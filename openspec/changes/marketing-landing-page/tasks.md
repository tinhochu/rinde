# Tasks

## 1. Landing app skeleton

- [x] 1.1 Create `apps/landing/` with `package.json` (name `@rinde/landing`, a `test` script running `node --test`), `index.html` (es), `en/index.html`, `styles.css`, a locally served subset WOFF2 font, favicon, and a 404 page. Verify: `pnpm --filter @rinde/landing test` runs (empty suite passes) and `npx serve apps/landing` shows both pages.
- [x] 1.2 Add the design tokens to `styles.css`: light and dark schemes from `apps/mobile/lib/theme.ts` (forest, primary, background, receipt paper, accent), following `prefers-color-scheme`, with reduced-motion handling. Verify: screenshots in light and dark at 360 px have no AA contrast failures (axe or a manual contrast check).

## 2. Content (Spanish and English)

- [x] 2.1 Write the Spanish page:
  - hero with "Abrir Rinde" and the comparison slot (fallback text with no numbers);
  - how it works: a three-step sequence (search, plan, send receipt or e-invoice for points);
  - where prices come from, including that the AI never invents a price;
  - install help (Android and iPhone steps);
  - final "Abrir Rinde";
  - footer.

  Stores are named in text only, with no claimed savings, counts or testimonials. Verify: the page works with JS disabled and its screenshot at 360 px is reviewed.
- [x] 2.2 Write `/en/` with the same sections and section ids in English, plus the language switch on both pages. The switch keeps the current section's `#id`. Each page declares `lang` and links the other with `hreflang` alternates. Verify: switching from `/#precios` lands on `/en/#precios`.
- [x] 2.3 Add the "Read in English" link on `/`, shown only when `navigator.languages` prefers English over Spanish, with no automatic redirect. Verify: Chrome with `--lang=en-US` shows the link; `es-CO` doesn't.
- [x] 2.4 Add `<title>`, a description, and Open Graph/Twitter tags per language, with 1200×630 preview images (ES and EN, no prices). Verify: the tags parse in a test, and a local OG check (for example `npx open-graph-scraper` or a curl of the tags) shows the right title, description and image per page.

## 3. Live comparison

- [x] 3.1 Implement `compare.js`:
  - try the staples `huevos`, `arroz`, `leche`, `aceite` in order against `GET {API}/api/catalog?query=`;
  - pick the first product with offers from ≥2 stores, preferring the largest `spread`;
  - stop after 4 s overall;
  - render name, pack, each store's price via `Intl.NumberFormat('es-CO', COP)` and its age via `Intl.RelativeTimeFormat` in the page's language;
  - mark the cheapest store;
  - add screen-reader text (store, price, age, cheapest);
  - on any failure, keep the fallback text;
  - never use storage.

  Verify: the comparison renders against a local API (`next dev` on 3100), and with the API stopped the fallback shows and no number appears.
- [x] 3.2 Style the comparison as the receipt strip in the hero, the page's single memorable element, with at most one entrance effect that is off under reduced motion. Verify: screenshots at 360 px and 1280 px are reviewed, and there is no horizontal scroll at 320 px.

## 4. App move: handoff, forward and old worker

- [x] 4.1 Add the inline `<head>` script to both landing pages:
  - when in standalone display mode (or `navigator.standalone`), collect the `rinde-*` localStorage keys (skip if `rinde-handoff-done`; cap at 64 KB, dropping searches and picks first);
  - `location.replace(APP_ORIGIN + '/#rinde-handoff=<base64url>')`;
  - set `rinde-handoff-done`, and delete old keys 30 days after it.

  Use the same handoff on "Abrir Rinde" clicks when old keys exist. Verify: a Node unit test of the encode/trim function, plus a CDP run with seeded keys and emulated standalone that lands on the app URL with the fragment.
- [x] 4.2 Import the handoff in the app at startup, before storage loads. (Done as an inline script in `apps/mobile/public/index.html` instead of a `lib/handoff.web.ts` module: it runs before any bundle code reads storage, including the theme preference.) It does the following:
  - read `#rinde-handoff`;
  - import keys only when `rinde-session` is absent;
  - clear the fragment with `history.replaceState`;
  - set `rinde-moved-notice`.

  Verify: `npx tsc --noEmit` in `apps/mobile`, and a CDP run where the handed-off session shows the same points and forwarding address and an existing session is kept untouched.
- [x] 4.3 Show a one-time notice in the app when `rinde-moved-notice` is set: "Rinde ahora vive en app.rinde.cool.chuventures.com. Instálala de nuevo desde aquí." It offers the existing install action and can be dismissed. Verify: the notice shows once after a handoff and not after a reload.
- [x] 4.4 Add the replacement `apps/landing/sw.js` (`skipWaiting`, delete all caches on activate, `clients.claim`, no fetch handler). The landing re-registers it only when a controller already exists. Verify: a CDP run with the old app worker registered on the origin shows the new worker active and Cache Storage empty after visiting `/`.

## 5. Images and routing

- [x] 5.1 Add `apps/landing/Dockerfile` (FROM `nginx:stable-alpine-slim`, copying the static files with content-hashed asset names) and `nginx.conf` with `APP_ORIGIN` filled in at build time (no envsubst in the slim image):
  - 301 for app paths `^/(cart|favorites|plan|profile|account|contributions|product/|receipt|search|_expo/|assets/|manifest\.json)` to the same URI on `APP_ORIGIN`;
  - `no-cache` for HTML and `sw.js`, immutable caching for hashed assets;
  - the 404 page for the rest.

  Verify: run the image locally; `curl -I /receipt/abc?x=1` returns 301 to `$APP_ORIGIN/receipt/abc?x=1`, `/en/` returns 200, and the image is under 30 MB.
- [x] 5.2 Move the PWA's Dockerfile and nginx.conf from the scratchpad into `apps/mobile/deploy/`, unchanged. Verify: the image builds from the repo and serves the exported `dist/`.
- [x] 5.3 Add a `landing` service to `docker-compose.yml` (image `rinde-landing`, `APP_ORIGIN` env) and document the new `CORS_ORIGINS`/`APP_URL` values in comments and `.env.example`. Verify: `docker compose config` is valid.
- [x] 5.4 Write tests in `apps/landing`:
  - ES and EN have identical section ids;
  - both have lang, hreflang, OG and Twitter tags;
  - no peso amount (`$` followed by digits) appears in the HTML;
  - the page weight without the API call is under 200 KB.

  Verify: `pnpm --filter @rinde/landing test` passes.

## 6. Deploy and verify

- [x] 6.1 Update the API env on Coolify:
  - `CORS_ORIGINS=https://app.rinde.cool.chuventures.com,https://rinde.cool.chuventures.com`;
  - `APP_URL=https://app.rinde.cool.chuventures.com`.

  Restart web. Verify: a preflight from each origin to `/api/catalog` returns its `Access-Control-Allow-Origin`.
- [x] 6.2 Build `rinde-app:<sha>` (with the handoff) and `rinde-landing:<sha>` on the server. PATCH the compose: app domain becomes `app.rinde.cool.chuventures.com`, the landing service goes on `rinde.cool.chuventures.com`. Restart, then delete only the old `rinde-*` images. Verify: both hosts serve over HTTPS with valid certificates.
- [x] 6.3 Run the production checks (CDP screenshots at 360 px and 1280 px):
  - ES and EN landing render;
  - the live comparison shows real prices with ages;
  - `/receipt/x` gets a 301;
  - standalone forward and handoff keep the session;
  - email-code sign-in works on the app subdomain;
  - a reply-email link uses the new host.

  Verify: the screenshots and curl outputs are recorded in the summary.
- [x] 6.4 (Not applicable on 2026-10-27: production sets no Google client, so Google sign-in is off. Redo this if it is turned on.) Manual for the user, if Google sign-in is configured: add `https://app.rinde.cool.chuventures.com` to the OAuth client's authorized JavaScript origins. Verify: Google sign-in completes on the app subdomain.
