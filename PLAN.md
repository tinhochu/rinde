# Rinde — Hackathon Plan

**Deadline:** Nov 4, 2026, 9:00 PM ET. Target is to submit by **6 PM ET**.
**Positioning:** Rinde is an **agent that builds a shopping plan**. It is not an image analyzer and not a dashboard.

## Framing (to stay off the organizers' "anti-projects" list)

| Risk | Rule |
|---|---|
| Simple image analyzer | Photo upload is just one way to enter a list and gets about 5 seconds in the demo. The pitch never leads with it. |
| Dashboard as main feature | The output is a **decision**: "D1 for these 9 items, Éxito for these 6, you save $38,400". It is not charts. |
| Basic RAG | Retrieval is one step. What sets Rinde apart is **reasoning over constraints**: budget, package sizes, equivalence and number of store trips. |
| Nutrition coach | No nutrition or meal-planning claims anywhere in the pitch. |

**Agentic moments the demo must show:**
1. **Live, visible tool calls:** "Checking D1… 14/15 found · observed 2 min ago".
2. **Budget negotiation loop:** when the basket goes over budget, the agent proposes trade-offs (store-brand swaps, smaller packs, dropping a non-essential item). The user accepts or rejects each one and the plan recalculates.
3. **Explained equivalence:** "Éstío 500g fríjol ≈ La Frijolera 500g: same type and weight, $1,740 cheaper".

## Judging (3 stages)

1. **Pass/fail:** the project must fit a theme and **use Meta AI products**. Make Muse usage obvious: put a "Powered by Muse" step in the UI and an architecture diagram in the README that marks every model call. Consider showing which Muse model handles each step (vision for lists, reasoning for equivalence and trade-offs).
2. **Rubric scoring, 0–10:** the rubric itself hasn't been seen yet. Get it at kickoff and map each criterion to a demo moment.
3. **Live final, Nov 9:** the top 5 per track demo **live**. The demo must survive wifi and API failures:
   - prices served from the Postgres snapshot, not live scraping
   - a cached fallback for the model calls
   - a rehearsed 3-minute script
   - the production URL kept warm

## Architecture rules

- **The LLM (Meta Muse) is used for:**
  - parsing the list from text or a photo
  - normalizing what the user means ("arroz Diana grande" → rice, Diana brand, about 1–5 kg)
  - judging whether candidate products are equivalent
  - writing substitution explanations and trade-off proposals
- **Deterministic code is used for:**
  - unit normalization (price per g, ml or unit)
  - pack-size math
  - budget enforcement
  - basket optimization
  - all totals and savings
- **The LLM never produces a price.** Every price shown carries `retailer`, `source URL`, `observedAt`.

## Data (validated Oct 26, see `docs/data-feasibility.md`)

All three chains run on VTEX, and prices, EANs and package sizes are available for a staples basket.

| Retailer | Robots-compliant route | Coverage of 15-item staples probe |
|---|---|---|
| D1 | `/api/catalog_system/pub/products/search` (not disallowed) | 14/15 (no canned tuna) |
| Jumbo | `/api/catalog_system/pub/products/search` (not disallowed) | 15/15 |
| Éxito | sitemap → product page → schema.org JSON-LD (`/api/` is disallowed) | 15/15 |

**Ingestion strategy:** a scheduled snapshot of a curated grocery catalog (staples categories) into Postgres. Each row is stored as a `PriceObservation` with source and timestamp. Live lookups run only for items missing from the snapshot. Requests go one at a time, are cached, and send an identifying User-Agent.

## Schedule

| Date | Deliverable |
|---|---|
| **Oct 26 (Mon)** | ✅ Data feasibility probe. Scaffold Next.js, Tailwind, shadcn, Prisma and Postgres. Set up OpenSpec. Write the schema. |
| **Oct 27 (Tue)** | Ingestors: D1 and Jumbo (API), Éxito (sitemap and JSON-LD). Curated staples catalog of about 1–3k SKUs per chain. Unit/size parser. |
| **Oct 28 (Wed)** | Meta Model API adapter. List parsing (text and photo). Intent normalization. Candidate retrieval with LLM equivalence judging. Review/edit screen. |
| **Oct 29 (Thu)** | Optimizer: per-item store and variant choice, pack-size math, store-trip penalty, hard budget constraint. Unit tests. |
| **Oct 30 (Fri)** | Substitutions with explanations. **Budget negotiation loop** with accept/reject. |
| **Oct 31 (Sat)** | Plan screen: per-store pick lists, totals, remaining budget, savings vs. a clearly defined baseline, data limitations. Streaming of live tool-call status. |
| **Nov 1 (Sun)** | Shareable savings card (OG image). Mobile/PWA polish. |
| **Nov 2 (Mon)** | End-to-end testing with real handwritten lists. Edge cases (unavailable items, no match, over budget). Production deploy. |
| **Nov 3 (Tue)** | Freeze features. Demo rehearsal. Record the video. Write the README and submission text. |
| **Nov 4 (Wed)** | Buffer. Submit by 6 PM ET. |

## Savings baseline (must be defined explicitly)

Default comparison basket: **the same items bought entirely at the single store with the lowest total, using the closest match to what the user literally asked for (no substitutions).** "Savings" means that baseline minus the optimized plan, so the comparison is honest and anyone can reproduce it.

## Open questions

- Meta Model API: docs, key, and which Muse model handles vision versus text.
- Track: indie or startup.
- **Location pricing:** VTEX prices may vary by region or sales channel. The probe used default (national) pricing. Check D1/Jumbo `regionId` or `sc` handling for Bogotá before the demo.
- Retailer terms of use: the robots.txt rules are respected, but the sites' terms still need checking. Label data "observed from public website".

## Out of scope

Payments, checkout, accounts, loyalty programs, multi-city coverage, nutrition and meal planning.
