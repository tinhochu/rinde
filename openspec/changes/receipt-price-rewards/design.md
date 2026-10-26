# Design

## Context

- **Prices:** every price comes from `PriceObservation` (`source`, `sourceUrl`, `observedAt`), joined to a store's `RetailerProduct` and a shared `Product` keyed by EAN.
  - Search (`compare.ts`) groups offers by EAN.
  - The planner's candidate provider (`candidates.ts`) reads observations up to 36 h old.
  - `verify.ts` re-checks chosen listings live.
- **Meta Model API:** not configured (`META_API_KEY` is empty).
  - `/api/extract` is a 503/501 stub.
  - The mobile list step already calls `extractPhoto` with an `expo-image-picker` asset.
- **Identity:** anonymous only.
  - The app sends `X-Rinde-Session`, but `lib/planner.ts` creates a new UUID on every launch, so today the "session" doesn't survive a restart.
  - Appwrite sign-in is pending and is a separate change.
- **Deployment:** Docker Compose on Coolify with Postgres and a worker. There is no object storage.
- **Produce:** has no shared code across chains (proposal: Why). Each store's online listing for produce is its own `RetailerProduct` with an internal code.

## Goals / Non-Goals

**Goals:**
- Receipts go through upload → draft → review → confirm, with every price traceable to the photo's text.
- The new price source plugs into the existing observation model, so search, the product modal and the planner gain it without a parallel price system.
- A demo that works end to end without the Meta API key.

**Non-Goals:**
- Accounts and sign-in. This change only defines how session rewards move to an account.
- Redeemable rewards, payouts or partner integrations.
- Stores other than D1, Jumbo and Éxito; branch-level price differences beyond showing the branch.
- Reading list photos (the existing stub stays as is).
- Moderation tooling beyond automatic checks and revocation.

## Decisions

### D1. Two-phase flow: draft, then confirm
- `POST /api/receipts` takes the image (multipart), stores it, runs extraction and checks, and returns a draft: a `Receipt` with status `draft`, its lines, check results and proposed matches.
- `POST /api/receipts/:id/confirm` takes the user's edits and exclusions, re-runs the checks on the edited values, writes observations and reward events in one transaction, and marks the receipt `confirmed`.
- Drafts older than 24 h are discarded.

*Alternative considered:* one call that extracts and stores. That makes the review cosmetic, and the spec requires that nothing becomes a price before review.

### D2. The model transcribes strings; code parses numbers
- The vision call returns JSON matching a fixed schema. Every numeric field is a **string as printed** ("3.980", "0,845 KG"), plus the line text and an optional code.
- The prompt asks for transcription only, with empty strings for illegible values, and tells the model to skip buyer identity fields.
- A deterministic parser in `packages/core` handles Colombian number formats ("." for thousands, "," for decimals), units (KG, GR, UN, LT) and discount lines. Reading values ourselves keeps "the LLM never produces a price" true: an unreadable string stays empty and is never estimated.

*Alternative considered:* asking the model for numbers. That hides misreads such as "3.980" read as 3.98, and it blurs where a value came from.

### D3. Arithmetic checks are pure functions
- In `packages/core/receipt`:
  - **Line check:** quantity × unit price = total, with tolerance `max(1, qty)` pesos for weighed rounding.
  - **Receipt reconciliation:** line totals plus discount lines equal the printed total.
- The API runs them on the draft and again on confirm. The client runs the same module on every edit for instant feedback.

### D4. Meta Model adapter with a demo fixture
- **The adapter:** `apps/web/src/server/muse.ts`.
  - It calls the Meta Responses API (`POST {META_API_BASE_URL}/responses`, base `https://api.meta.ai/v1`, OpenAI-compatible, so the `openai` SDK works). The request carries an `input_text` instruction, the photo as an `input_image` base64 data URL, and `text.format` set to a strict JSON schema.
  - The model is set by `META_VISION_MODEL`, which defaults to `muse-spark-1.3`.
  - Verified on 2026-10-26 with the project key:
    - A base64 image plus a strict schema returned schema-valid JSON in 8.6 s.
    - An image with no printed prices came back with empty price strings rather than guesses.
    - Most output tokens are reasoning tokens (518 of 548 on a one-sentence answer), so latency, not size, drives the timeout.
  - Timeout is 30 s, with one retry on a 5xx error.
- **When `META_API_KEY` is unset, or the call fails or times out:**
  - With `DEMO_RECEIPTS=1`, the adapter compares the image's SHA-256 against recorded sample receipts (fixtures under `apps/web/fixtures/receipts/`, one per chain) and returns the recorded extraction, flagged `demo: true`.
  - The mobile review screen shows "Ejemplo de demostración" and a "Probar con una factura de ejemplo" button that sends a bundled sample.
  - Otherwise the adapter returns the "no disponible" error from the spec.
- The same adapter later serves list photos and equivalence judging.

### D5. Matching lines: printed code, then a cached alias, then the model choosing from candidates
For each line, in order:
1. **Printed EAN** → `Product.ean`, then that store's `RetailerProduct`.
2. **Store-internal code** (for example Jumbo's "116"): look up `RetailerProduct.externalId` or the stored `referenceId` for that store.
3. **`ReceiptAlias`** (store + normalized line text → listing), learned from earlier confirmations.
4. **Search:** run the existing snapshot search on the line text with abbreviations expanded (a small dictionary: ARZ→arroz, LCH→leche, …). Muse is then asked to **pick one of the top 8 candidate ids, or none**. It can only choose from listings that exist.

The user's confirmation writes or refreshes the alias, so repeat receipts skip the model. Without the API key, step 4 proposes the top text match and leaves the choice to the user.

### D6. Produce gets canonical items stored as ordinary listings
- **Canonical items:** a seeded `ProduceItem` table (slug, name, aliases, default selling unit), about 40 common items.
- **One listing per store and item:** a produce line is stored against a per-store **synthetic `RetailerProduct`**, with `externalId` `produce:<slug>:kg` or `produce:<slug>:unit` and a shared `Product` (no EAN; size 1000 g or 1 unit; category "Frutas y verduras").
- **Price per kg or per unit:** it's the unit price exactly as the receipt prints it. If the receipt prints only weight and total, it's total ÷ weight, rounded to the peso and marked derived.
- **Comparison:** `compare.ts` groups by the key `produce:<slug>:<unit>` alongside `ean:`, so same-unit prices get a verdict. The kg and unit groups for one item are shown together without a verdict, as the spec requires.

*Alternative considered:* a separate community-price table. That would duplicate every read path (search, modal, planner, verification).

### D7. Provenance in the data and the contract
- **New observations:** receipt observations use `source = "community:receipt"`, `sourceUrl = "rinde://receipts/<id>#<line>"`, and a new nullable `PriceObservation.receiptLineId`.
- **Separate read windows:**
  - Online reads keep `source NOT LIKE 'community:%'` and their 36 h window.
  - Community reads use a 72 h window measured from `observedAt`, which is the receipt time.
- **The `Offer` contract gains:**
  - `source: "online" | "receipt"`, plus `branch?: string`.
  - Only the cheapest offer per store and source.
- **`StorePrices` on mobile:**
  - Online rows come first.
  - A receipt price for a store that has an online row appears as a sub-line ("En tienda: …").
  - A store with only a receipt price shows a full row labeled "Reportado en tienda · factura · hace X h".

### D8. Planner fallback in the candidate provider
- `candidates.ts` first gathers online candidates as it does now. For each (item, store) pair with **no** acceptable online candidate, it adds receipt candidates under 72 h old, with a new `priceStatus: "reported"`.
- `verify.ts` skips `reported` candidates.
- The plan line's reason and provenance render "Precio reportado en factura hace N h; no verificado en línea".
- The optimizer itself is unchanged: a reported candidate is just a candidate.

### D9. Rewards as an append-only ledger
- **`Contributor`:**
  - `id`, `sessionId` (unique), `accountId?`, `displayName?`, and `zone`.
  - It's created on the first receipt.
- **`RewardEvent`:**
  - Fields: contributor, kind (`line`, `gap_bonus`, `revoked`), points, receipt and line references, and `createdAt`.
  - Balance is `SUM(points)`, and the weekly leaderboard is the same sum grouped by contributor, filtered by week (America/Bogota) and zone.
- **`ContributorBadge`:** unique on (contributor, badge). It's evaluated after each confirm from ledger counts.
- **Revocation:** inserts negative events. Nothing is updated or deleted.
- **Gap bonus:** decided inside the confirm transaction, using the same "current price" queries as display, so two people confirming the same gap at once can't both see it as open after the first commit.

### D10. Identity: persist the anonymous session and enforce caps on it
- **Persistence:** the mobile app persists its session UUID in AsyncStorage (a fix to `lib/planner.ts`'s per-launch UUID). It's exposed as one helper used by every API call.
- **Caps and duplicates:**
  - The daily cap (5 receipts) and rate limiting key on the session id.
  - Duplicate detection is global (D11), so a fresh session can't replay a receipt.
- **Sign-in later:** linking sets `Contributor.accountId`. Merging two contributors sums their ledgers and keeps the earliest badge dates. This change specifies it; the sign-in change implements the trigger.

*Accepted risk:* sessions can be reset to evade caps. Global duplicate detection and the 72 h freshness window bound the damage, and points have no cash value.

### D11. Duplicate guardrail: printed identity first, enforced by the database
Every check is global (across contributors and sessions) and backed by a unique index, so the database decides a race, not application code.

| Layer | Key | When checked | Unique index |
|---|---|---|---|
| 1. Same file | SHA-256 of the uploaded bytes | On upload, **before** the model call (also saves cost) | `Receipt.imageHash` |
| 2. Invoice identity | store + normalized invoice number (prefix and consecutive, spaces and dashes removed) | Draft and confirm | `(store, invoiceNumber)` |
| 3. Electronic invoice | CUFE, read from the printed text or the QR | Draft and confirm | `cufe` (nullable) |
| 4. Header fingerprint | SHA-256 of store \| branch \| purchase minute \| printed total | Draft and confirm | `headerFingerprint` |

- **Uniqueness covers only accepted receipts.** The indexes are partial (`WHERE status = 'confirmed'`), so abandoned drafts don't block a legitimate retake. Layers 1–4 also run at draft time against confirmed receipts, so a duplicate is turned away before the user spends time reviewing it.
- **Header is read-only.** All four keys come from the photo, and the review screen can't edit them; only lines are editable. The earlier "fingerprint over edited line totals" is dropped, because a user could change one line to escape it.
- **Invoice number is required.** Without a legible number the receipt can't be accepted, which keeps layer 2 always available. Layer 4 catches a retake whose number is misread differently.
- **Concurrent confirms:** confirm sets `status = 'confirmed'` inside the transaction. The partial unique indexes make the second commit fail, and that failure maps to "Esta factura ya fue registrada." with the whole transaction (observations, reward events) rolled back.
- **Audit and suspension:** every rejection writes a `DuplicateAttempt` row (session, layer, matched receipt id). Three in 24 h set `Contributor.suspendedUntil`, and the upload route checks it first.
- **Later discovery:** if a duplicate is found after acceptance (for example via a manual audit), D9's revocation applies.

*Alternatives considered:* a perceptual image hash for near-identical photos. It's redundant once layers 2 and 4 read the receipt's own identity, and it misfires on different receipts with the same layout. A content hash over line items was dropped as above.

### D12. Image storage and retention
- Images are written to a Compose volume mounted at `/data/receipts/<receiptId>.jpg`.
- The client downsizes before upload (picker `quality: 0.7`, longest side about 2000 px), keeping uploads under the 10 MB limit and speeding up extraction.
- A worker job deletes images and drafts past retention (30 days for images, 24 h for drafts).
- Images are never served publicly. The review screen gets a short-lived signed URL.

### D13. Personal data
- The prompt excludes buyer fields.
- As a second line of defense, the parser drops lines matching ID or card patterns (CC/NIT followed by digits, masked card numbers, approval codes) before anything is stored.
- Raw model output is not persisted. Only the parsed fields are.

## Risks / Trade-offs

- **[A legitimate receipt's invoice number is unreadable, so it can't earn points]** → The error asks for a retake including the bottom of the receipt. This is accepted as a cost of the guardrail.
- **[Two different receipts share store, branch, minute and total]** (for example, two identical baskets at adjacent tills) → This is rare. The second is rejected as a duplicate and the user can report it; it's accepted for the hackathon.
- **[Misreads on crumpled or thermal-faded receipts]** → Arithmetic checks, mandatory review, and points only for lines that pass. The demo uses clean fixtures.
- **[Abbreviated names match wrongly]** → The model chooses only from real candidates, and the user confirms. Aliases make repeats cheap and consistent.
- **[A receipt price diverges from online and confuses users]** → Both are shown, online first, clearly labeled, and online wins in the planner.
- **[Session farming]** → The global duplicate guardrail (D11), the 72 h window, daily caps, suspension after repeated duplicates, and revocation. Points are worthless outside the app. Abuse is accepted for the hackathon.
- **[Meta API latency or shape unknown]** → The adapter sits behind one interface with a 30 s timeout, and the fixture path keeps the demo independent.
- **[Synthetic produce listings blur "online catalog" with "reported"]** → Their `externalId` prefix and `source` keep them separable, and online reads exclude community sources.
- **[Volume storage isn't replicated]** → Acceptable for hackathon retention. Images aren't needed after review.

## Migration Plan

1. One Prisma migration.
   - New tables: `Receipt`, `ReceiptLine`, `ReceiptAlias`, `ProduceItem`, `Contributor`, `RewardEvent`, `ContributorBadge` and `DuplicateAttempt`.
   - Partial unique indexes on confirmed receipts (D11). Prisma can't express these, so they go in the migration's raw SQL.
   - New column: nullable `PriceObservation.receiptLineId`, with an index on `(source, observedAt)`.
2. A seed script for `ProduceItem` and the demo fixtures.
3. A `receipts` volume in `docker-compose.yml`, mounted in `web` and `worker`. New env vars: `META_VISION_MODEL` and `DEMO_RECEIPTS`.
4. Release without the key: the demo path works, and real receipts return "no disponible".
5. Rollback: hide the mobile entry points. Online reads already exclude community sources, so a rollback leaves search and the planner unchanged.

## Open Questions

- Whether `muse-spark-1.3` reads faded thermal receipts reliably enough, or whether `muse-spark-1.3-contributor` (also available to the key) does better. This is measured in task 8.2 and only changes `META_VISION_MODEL`.
- Whether D1 receipts print EANs. This only changes how often step 1 versus step 3 or 4 of D5 matches.
