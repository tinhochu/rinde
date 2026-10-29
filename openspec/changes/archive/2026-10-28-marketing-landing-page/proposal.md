# Proposal

## Why

Anyone who opens `rinde.cool.chuventures.com` today, whether a hackathon judge or a shopper who got a link on WhatsApp, lands straight in the app with nothing to say what Rinde is, where its prices come from or why to install it. The submission needs one link that explains Rinde in seconds and sends people into the app. The root domain should hold that page, and the app should move to its own subdomain.

## What Changes

- New static marketing site in the monorepo, `apps/landing`, served at the root domain `rinde.cool.chuventures.com`. It is a separate app from the Expo client: plain HTML/CSS with a little JavaScript, built into a tiny nginx image.
- The page explains in Spanish what Rinde does:
  - compares D1, Jumbo and Éxito;
  - plans where your shopping costs least;
  - lets you send receipts (photo or electronic invoice) for points.
- It also covers how prices are sourced and dated: the AI never invents a price. And it links into the app: "Abrir Rinde", plus install help for the PWA.
- The hero shows a **live** price comparison read from the public catalog API, with each store's price and how long ago it was seen. When the API cannot answer, the comparison is hidden and no number is shown; there are no stored or made-up prices.
- An English version for judges at `/en`, with a language switch.
- Social preview (Open Graph/Twitter) image and metadata so the link previews well in WhatsApp and on social media.
- **BREAKING**: the app (Expo web PWA) moves from `rinde.cool.chuventures.com` to `app.rinde.cool.chuventures.com`. A PWA is tied to its origin, so existing installs must be carried over:
  - when the root is opened as an installed app (standalone display mode), it forwards to the app domain;
  - root-domain app paths such as `/receipt/...` redirect to the same path on the app domain;
  - the old service worker on the root domain is replaced by one that clears the app caches.
- API configuration follows the move:
  - CORS and Better Auth trusted origins gain the app and landing origins;
  - reply-email review links (`APP_URL`) point to the app domain.

## Capabilities

### New Capabilities
- `marketing-landing`: the public landing page at the root domain. It covers content, the live price proof with its no-fabrication rule, calls to action into the app, the Spanish and English versions, social previews, performance on low-end phones, and accessibility.
- `app-domain-move`: the app is served from the `app.` subdomain. Old links, installed PWAs and the old service worker on the root domain are moved over, and the API's allowed origins and reply links follow.

### Modified Capabilities
<!-- openspec/specs has no main specs yet; nothing to modify. -->

## Impact

- **New** `apps/landing/`:
  - static pages, styles, a small script, the OG image and icons;
  - its own Dockerfile (nginx:stable-alpine-slim) and nginx.conf.
  - It needs no dependency on the Expo app or the API code.
- **`apps/mobile`**: none functionally. The production build uses the same `EXPO_PUBLIC_API_URL`; only where it is hosted changes. The PWA's Dockerfile/nginx.conf, currently outside the repo, gets checked in alongside so both static images are reproducible.
- **`apps/web`**: no code change expected, only environment values:
  - `CORS_ORIGINS=https://app.rinde.cool.chuventures.com,https://rinde.cool.chuventures.com`;
  - `APP_URL=https://app.rinde.cool.chuventures.com`.
  - The landing page uses the existing `GET /api/catalog`.
- **Deploy (Coolify service `2mljoovynzli0mntaoowlq2j`)**:
  - new `landing` container on the root domain;
  - the `app` container's domain changes to `app.rinde.cool.chuventures.com`.
  - DNS already resolves `app.rinde.cool.chuventures.com` to the server; Traefik issues its certificate.
  - One more small image (~25 MB) on the shared server.
- **Better Auth / Google sign-in**: the trusted origins come from `CORS_ORIGINS`, so they update with it. If a Google OAuth client is configured, its authorized JavaScript origins need the new app origin.
- **Users who installed the PWA**: their installed icon keeps opening the root domain and is forwarded to the app domain. They can reinstall from the app domain. Local data such as the device session, favorites and plan is stored per origin and does not carry over automatically (see design).
