# @rinde/mobile — the one Rinde client codebase

Expo (SDK 58) + expo-router app, ported from the Dyad PWA. One codebase ships
three targets: **web PWA** (`expo export`), **iOS**, and **Android** (EAS).

## Develop

Requires Node 22+ (SDK 58). The repo default may be older — use 24:

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$PATH"
```

Install (from the repo root, pnpm workspace):

```bash
pnpm install
```

Point the app at a running Rinde backend (the Dyad Next server for now):

```bash
# same machine / emulator
EXPO_PUBLIC_API_URL=http://localhost:3000
# physical phone on LAN: use your machine's LAN IP instead of localhost
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000
```

Run:

```bash
cd apps/mobile
pnpm start            # scan the QR with Expo Go (same Wi-Fi)
pnpm web              # web PWA in the browser
pnpm typecheck && pnpm test
```

## Ship

```bash
pnpm build            # static web PWA into apps/mobile/dist/
```

Native (needs an Expo account + store credentials, see `eas.json`):

```bash
npx eas build -p ios --profile production --auto-submit
npx eas build -p android --profile production --auto-submit
```

Before submitting: fill `appleId`/`ascAppId`/`appleTeamId` and place the Play
`pc-api-key.json` next to `eas.json` (gitignored — never commit it).

## Notes

- Prices come only from the backend (`/api/prices`, `/api/catalog`, `/api/extract`).
  The app never invents prices; see `lib/market.ts` + `lib/shop.ts` (tested).
- Photo lists need the backend's `MUSE_*` env configured; otherwise use the
  text/manual tabs.
- The savings receipt shares as text in v1; the PNG receipt needs a dev build
  (react-native-view-shot) — see `lib/share-receipt.ts`.
