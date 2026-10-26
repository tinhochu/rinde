# Proposal

## Why

Online catalogs leave two gaps that matter for a Colombian grocery shopper. First, fresh produce can't be compared across stores, because each chain uses its own internal code (D1 `7700304945955`, Jumbo `116`, Éxito `7701001051086` for a banana) and sells by different units. Second, a store's online price isn't always its shelf price. Shoppers already carry the missing evidence in their pocket: the receipt (factura). Rewarding them for photographing it turns every trip into fresh, in-store, dated prices. It also makes Meta Muse's vision model central to the product, which the hackathon requires.

## What Changes

- **Receipt capture.** A new "Escanear factura" flow in the mobile app takes a photo from the camera or library. Muse vision reads the store, branch, date and line items (name as printed, quantity or weight, unit price, line total, and the code when printed).
- **Prices come only from the receipt.** Muse transcribes; it never supplies a price. Arithmetic checks (quantity × unit price = line total, lines add up to the receipt total) flag misreads. The user reviews and corrects every line before submitting.
- **Line matching.** Each line is matched to a catalog product: by EAN when printed, otherwise by Muse equivalence over snapshot listings. Produce is normalized to a canonical item (for example "Banano") with a per-kg or per-unit price. That gives produce a cross-store comparison key for the first time.
- **Community prices.** Confirmed lines become price observations with source `community:receipt`, linked to the receipt and observed at the receipt's date. They are shown separately from online prices, labeled "Reportado en tienda · factura · hace 2 h", and expire 72 h after the receipt's date.
- **Planner fallback.** The planner uses a community price only when no online price exists for that item at that store, and the plan line says so.
- **Rewards.** Points per accepted line, plus a bonus for filling gaps (a store or product with no current price, or produce). Badges and a neighborhood leaderboard. No real money.
- **Anti-abuse.**
  - **Duplicate receipts are never accepted, by anyone.** The guardrail is layered: the printed invoice number (and the CUFE on electronic invoices) is required and unique per store, the same photo file is rejected before extraction, and the same store, branch, minute and total is rejected even when the number is misread. Users can't edit the receipt header, so editing can't dodge the check. Repeated duplicate attempts suspend scanning for that session for 24 h.
  - Receipts must be at most 72 h old, the same window in which their prices are shown.
  - Each contributor has a daily cap.
  - Points are granted only for lines that pass the checks.
- **Identity.** Contributors are identified by the existing anonymous device session (`X-Rinde-Session`). Points move to an account when Appwrite sign-in lands; that is a separate change.
- **Extraction without the API key.** The Meta Model API key isn't configured yet. A fixture-backed extractor makes the flow work in development and serves as the demo fallback.
- **The stub goes away.** The `/api/extract` stub (which returns 501) is replaced for receipts. List-photo extraction is unchanged.

## Capabilities

### New Capabilities
- `receipt-capture`: Photographing a receipt, extracting its header and lines with Muse vision, checking the arithmetic, the user's review and correction, and submission, including duplicate, date-window and cap rules.
- `community-prices`: Turning confirmed receipt lines into labeled, expiring price observations. Matching them to catalog products (EAN, equivalence, produce normalization). Showing them in comparisons and product details. The planner's online-first fallback rule.
- `contributor-rewards`: Points, gap bonuses, badges and the neighborhood leaderboard for receipt contributions, tied to the anonymous session and transferable to an account later.

### Modified Capabilities
<!-- None in openspec/specs/ yet. The planner's requirements live in the unarchived
     multi-store-trip-planner change (trip-planning); the community-price fallback is
     specified in community-prices so that change doesn't need re-opening. -->

## Impact

- **Database (`packages/db`):** new `Receipt`, `ReceiptLine` and `RewardEvent` models; a link from `PriceObservation` to `ReceiptLine`; a canonical produce mapping. A migration is needed.
- **API (`apps/web`):**
  - New routes:
    - `POST /api/receipts` (upload and extract)
    - `POST /api/receipts/:id/confirm`
    - `GET /api/rewards/me`
    - `GET /api/rewards/leaderboard`
  - A Meta Model API adapter with a fixture fallback.
  - `compare.ts` and `offers.ts` include community observations, and the contract gains an offer `source` kind.
  - The planner's candidate provider applies the fallback rule.
- **Mobile (`apps/mobile`):**
  - The scan entry points.
  - A review screen.
  - Labeled community rows in `StorePrices`.
  - Rewards in Perfil.
  - Uses `expo-image-picker`, which is already installed.
- **Config:** `META_API_KEY`, `META_API_BASE_URL` and the Muse vision model id. Receipt image storage (local volume in Coolify for the hackathon).
- **Privacy:** receipts can carry personal data (cédula, card digits, name). These fields are not extracted or stored, and photos are kept only as long as review and audit need them.
