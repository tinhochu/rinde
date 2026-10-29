import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { candidatesFor, pickSameProduct, type MatchItem } from "@rinde/core";
import { db, type RetailerSlug } from "@rinde/db";
import { aisleOf } from "../aisles";
import { museConfig } from "../muse";
import { listingsOfSize, type ListingRow } from "../offers";
import { judgeSameProduct, type PhotoMode } from "../same-product";

/**
 * How often Meta Muse finds the same product at another store, scored against barcodes.
 *
 * Products sold at two stores under one EAN give an answer key nobody labels by hand: Muse sees store
 * A's listing and store B's same-size, same-brand candidates (the pool matchByName builds), names, sizes
 * and the stores' photos, never the barcode. A "find" case has the barcode twin in the pool and must pick it; a
 * "none" case has it removed and must pick nothing. The strict word rule runs on the same cases.
 *
 *   MUSE_EVAL=1 INTEGRATION=1 npx vitest run src/server/eval   (needs META_API_KEY and the dev DB)
 *   MUSE_EVAL_BUILD=1 rebuilds eval/same-product.cases.json from the DB; otherwise the saved cases run.
 *   A person reads each disagreement into eval/same-product.review.json; MUSE_EVAL_REPORT=1 then rewrites
 *   RESULTS.md from the saved answers.
 *   MUSE_EVAL_SET=heldout runs a second set built from other products (seed and files of its own). Tune the
 *   prompt on the default set only; the held-out set says whether a change helps on products it never saw.
 */

const EVAL_DIR = path.join(process.cwd(), "eval");
const HELDOUT = process.env["MUSE_EVAL_SET"] === "heldout";
const file = (kind: string) => path.join(EVAL_DIR, `same-product${HELDOUT ? ".heldout" : ""}.${kind}.json`);
const CASES = file("cases");
const REPORT = path.join(EVAL_DIR, HELDOUT ? "RESULTS-heldout.md" : "RESULTS.md");
const FIND = 80;
const NONE = 40;
const PARALLEL = 6;
/** When Muse also looks at the stores' product photos; the app's default unless MUSE_EVAL_PHOTOS says otherwise. */
const PHOTOS = (process.env["MUSE_EVAL_PHOTOS"] || "multi") as PhotoMode;

type Item = MatchItem & { store: RetailerSlug; imageUrl?: string | null };
type Case = { id: string; kind: "find" | "none"; target: Item; candidates: Item[]; answer: string | null };
type Outcome = Case & { muse: string | null; museReason: string | null; museUnsure?: boolean; rules: string | null; ms: number };

const item = (r: ListingRow): Item => ({
  id: r.listingId, store: r.slug as RetailerSlug, name: r.name, brand: r.brand,
  size: r.size && r.unit ? { amount: Number(r.size), unit: r.unit } : null, aisle: aisleOf(r.category, r.name),
});

/** Deterministic order, so a rebuild on the same data picks the same cases. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

async function buildCases(seed: number, avoid: Set<string>): Promise<Case[]> {
  // Pairs of listings at two stores that share one product (one EAN) and are named differently.
  const pairs = await db().$queryRaw<{ a: string; b: string; bslug: RetailerSlug; brand: string; size: string; unit: "g" | "ml" | "unit" }[]>`
    SELECT ra.id AS a, rb.id AS b, sb.slug::text AS bslug, p.brand, p.size::text AS size, p.unit::text AS unit
    FROM "RetailerProduct" ra
    JOIN "RetailerProduct" rb ON rb."productId" = ra."productId" AND rb."retailerId" <> ra."retailerId"
    JOIN "Retailer" sb ON sb.id = rb."retailerId"
    JOIN "Product" p ON p.id = ra."productId"
    WHERE p.ean IS NOT NULL AND p.brand IS NOT NULL AND p.size IS NOT NULL AND p.unit IS NOT NULL
      AND lower(ra.name) <> lower(rb.name)`;
  const random = seeded(seed);
  const order = pairs.map((p) => ({ p, r: random() })).sort((x, y) => x.r - y.r).map((x) => x.p);

  const cases: Case[] = [];
  const usedProducts = new Set<string>();
  let find = 0;
  let none = 0;
  for (const pair of order) {
    if (find >= FIND && none >= NONE) break;
    const pool = await listingsOfSize({ amount: Number(pair.size), unit: pair.unit }, pair.brand, [pair.bslug]);
    const targetRow = (await db().$queryRaw<ListingRow[]>`
      SELECT rp.id AS "listingId", rp."productId", r.slug, rp.name, p.brand, p.size::text AS size, p.unit, p.category
      FROM "RetailerProduct" rp JOIN "Product" p ON p.id = rp."productId" JOIN "Retailer" r ON r.id = rp."retailerId"
      WHERE rp.id = ${pair.a}`)[0];
    if (!targetRow || usedProducts.has(targetRow.productId) || avoid.has(targetRow.productId)) continue;
    const target = item(targetRow);
    const all = candidatesFor(target, pool.map(item));
    const twin = all.find((c) => c.id === pair.b);
    if (!twin) continue;
    // Listings of the target's own product at store B would also be right answers; keep cases with one twin.
    if (pool.filter((r) => r.productId === targetRow.productId).length !== 1) continue;
    const others = all.filter((c) => c.id !== pair.b);
    // Every third case without the twin while both kinds still need cases, so neither runs out of products.
    const wantNone = none < NONE && others.length >= 2 && (find >= FIND || none * 2 < find);
    if (find < FIND && others.length >= 1 && !wantNone) {
      cases.push({ id: `find-${find}`, kind: "find", target, candidates: all, answer: twin.id });
      find++;
      usedProducts.add(targetRow.productId);
    } else if (none < NONE && others.length >= 2) {
      cases.push({ id: `none-${none}`, kind: "none", target, candidates: others, answer: null });
      none++;
      usedProducts.add(targetRow.productId);
    }
  }
  return cases;
}

async function pool<T, R>(items: T[], n: number, run: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i]!);
    }
  }));
  return out;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)} %` : "n/a");
const describeItem = (i: Item) => `${i.name} (${i.store})`;

type Review = { id: string; verdict: "muse-right" | "muse-wrong" | "unclear"; note: string };

/** When Muse looked at the photos. */
function photoNote() {
  return {
    never: "Muse saw no photos.",
    unsure: "Muse looked at the stores' product photos only when the names alone left it not sure.",
    multi: "Muse looked at the stores' product photos whenever two or more listings could be it, as in the app.",
    always: "Muse looked at the stores' product photos on every case.",
  }[PHOTOS];
}

function report(outcomes: Outcome[], model: string, review: Review[]) {
  const score = (pick: (o: Outcome) => string | null) => {
    const finds = outcomes.filter((o) => o.kind === "find");
    const nones = outcomes.filter((o) => o.kind === "none");
    const found = finds.filter((o) => pick(o) === o.answer).length;
    const wrongFind = finds.filter((o) => pick(o) !== null && pick(o) !== o.answer).length;
    const missed = finds.filter((o) => pick(o) === null).length;
    const heldBack = nones.filter((o) => pick(o) === null).length;
    const falseMatch = nones.length - heldBack;
    const picks = outcomes.filter((o) => pick(o) !== null);
    const rightPicks = picks.filter((o) => pick(o) === o.answer).length;
    return { finds: finds.length, nones: nones.length, found, wrongFind, missed, heldBack, falseMatch, correct: found + heldBack, picks: picks.length, rightPicks };
  };
  const unsure = outcomes.filter((o) => o.museUnsure);
  const m = score((o) => o.muse);
  const r = score((o) => o.rules);
  const ms = outcomes.map((o) => o.ms).sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)] ?? 0;
  const p90 = ms[Math.floor(ms.length * 0.9)] ?? 0;
  const row = (label: string, s: ReturnType<typeof score>, notSure: number | string) =>
    `| ${label} | ${pct(s.correct, s.finds + s.nones)} | ${pct(s.found, s.finds)} | ${pct(s.heldBack, s.nones)} | ${pct(s.rightPicks, s.picks)} | ${s.wrongFind + s.falseMatch} | ${notSure} |`;
  // "Not sure" on a case without the product is still right: it showed no price.
  const mistakes = outcomes.filter((o) => o.muse !== o.answer || (o.museUnsure && o.answer !== null));
  const reviewed = new Map(review.map((r) => [r.id, r]));
  const unreviewed = mistakes.filter((o) => !reviewed.has(o.id)).length;
  const kept = outcomes.filter((o) => reviewed.get(o.id)?.verdict !== "unclear");
  // A review judges a disagreement; when a later run agrees with the barcode, the old verdict no longer applies.
  const museRight = (o: Outcome) => (o.muse === o.answer && !(o.museUnsure && o.answer !== null)) || reviewed.get(o.id)?.verdict === "muse-right";
  const wrongPicks = kept.filter((o) => o.muse !== null && !museRight(o)).length;
  const afterReview = review.length === 0 ? "" : `
**After a person read every disagreement** (\`eval/${path.basename(file("review"))}\`): ${kept.filter(museRight).length} of ${kept.length} right, **${pct(kept.filter(museRight).length, kept.length)}**, with ${wrongPicks} wrong products picked. ${outcomes.length - kept.length} cases were set aside because the stores' own names can't tell the products apart, and ${outcomes.filter((o) => o.muse !== o.answer && reviewed.get(o.id)?.verdict === "muse-right").length} counted for Muse because both listings are the same product under different barcodes.${unreviewed ? ` ${unreviewed} disagreements are not reviewed yet.` : ""}
`;
  const byId = (o: Outcome, id: string | null) => (id ? describeItem(o.candidates.find((c) => c.id === id)!) : "none");

  return `# Meta Muse: same product across stores${HELDOUT ? " (held-out set)" : ""}

Run ${new Date().toISOString().slice(0, 10)} with \`${model}\` on ${outcomes.length} cases (${m.finds} with the product in the other store's list, ${m.nones} without it).
The answer key is the barcode: each case is a product two stores sell under one EAN. Muse sees names, brands, sizes and the stores' product photos, never the barcode or a price, exactly as in the app.

| Judge | Correct overall | Found the product | Said "none" when it wasn't there | Right when it picked one | Wrong products picked | Said "not sure" |
| --- | --- | --- | --- | --- | --- | --- |
${row("Meta Muse", m, unsure.length)}
${row("Word rule (no AI)", r, "n/a")}

${photoNote()} Two stores often show the same manufacturer photo; see \`eval/TUNING.md\` for the score on cases where the photos look different.

"Not sure" shows no price for that store and says why; it is never a wrong price.${unsure.length ? ` Not sure on: ${unsure.map((o) => `${o.id} (${o.kind === "find" ? "product was there" : "product was not there"})`).join(", ")}.` : ""}

${afterReview}
Muse time per judgment: median ${(median / 1000).toFixed(1)} s, 90th percentile ${(p90 / 1000).toFixed(1)} s.

A wrong pick is the costly error: it would show one product's price for another. The app also checks every Muse pick against size and brand again before using it.

## Every case Muse got wrong

${mistakes.length === 0 ? "None." : mistakes.map((o) => `- **${o.id}**: ${describeItem(o.target)}\n  - expected: ${byId(o, o.answer)}\n  - Muse: ${o.museUnsure ? "not sure" : byId(o, o.muse)}${o.museReason ? `, "${o.museReason}"` : ""}${reviewed.has(o.id) ? `\n  - review: ${reviewed.get(o.id)!.verdict}, ${reviewed.get(o.id)!.note}` : ""}`).join("\n")}

Some "wrong" answers may be right: two listings can be the same product under different barcodes. Each is listed above so a person can check it.

Cases: \`eval/${path.basename(CASES)}\`. Run: \`MUSE_EVAL=1${HELDOUT ? " MUSE_EVAL_SET=heldout" : ""} INTEGRATION=1 npx vitest run src/server/eval\` in apps/web.
`;
}

describe.skipIf(!process.env["MUSE_EVAL"])("Meta Muse accuracy: same product across stores", () => {
  it("scores Muse and the word rule against barcodes", async () => {
    mkdirSync(EVAL_DIR, { recursive: true });
    if (process.env["MUSE_EVAL_BUILD"] || !existsSync(CASES)) {
      // The held-out set never shares a product with the tuning set.
      const avoid = new Set<string>();
      if (HELDOUT) {
        const dev = JSON.parse(readFileSync(path.join(EVAL_DIR, "same-product.cases.json"), "utf8")) as Case[];
        const ids = dev.flatMap((c) => [c.target.id, ...c.candidates.map((x) => x.id)]);
        for (const r of await db().retailerProduct.findMany({ where: { id: { in: ids } }, select: { productId: true } })) avoid.add(r.productId);
      }
      writeFileSync(CASES, JSON.stringify(await buildCases(HELDOUT ? 4112026 : 20261029, avoid), null, 1) + "\n");
    }
    const cases = JSON.parse(readFileSync(CASES, "utf8")) as Case[];
    expect(cases.length).toBeGreaterThan(0);
    // Photos come from the DB at run time, as in the app; the saved cases hold names only.
    const ids = cases.flatMap((c) => [c.target.id, ...c.candidates.map((x) => x.id)]);
    const photo = new Map((await db().retailerProduct.findMany({ where: { id: { in: ids } }, select: { id: true, imageUrl: true } })).map((r) => [r.id, r.imageUrl]));
    for (const c of cases) for (const i of [c.target, ...c.candidates]) i.imageUrl = photo.get(i.id) ?? null;

    const cfg = museConfig();
    const saved = file("results");
    // MUSE_EVAL_REPORT=1 rewrites the report from the last run's answers, after a review, without asking Muse again.
    const outcomes = process.env["MUSE_EVAL_REPORT"] ? (JSON.parse(readFileSync(saved, "utf8")) as Outcome[]) : await pool(cases, PARALLEL, async (c): Promise<Outcome> => {
      const start = Date.now();
      const verdict = await judgeSameProduct(c.target, c.candidates, cfg, { photos: PHOTOS });
      return {
        ...c, ms: Date.now() - start,
        muse: verdict.by === "muse" ? verdict.pick?.id ?? null : null,
        museReason: verdict.reason,
        museUnsure: verdict.unsure === true,
        rules: pickSameProduct(c.target, c.candidates)?.id ?? null,
      };
    });
    writeFileSync(saved, JSON.stringify(outcomes, null, 1) + "\n");
    const reviewFile = file("review");
    // The review belongs to these cases; a rebuild starts a fresh one.
    const review = existsSync(reviewFile) && !process.env["MUSE_EVAL_BUILD"] ? (JSON.parse(readFileSync(reviewFile, "utf8")) as Review[]) : [];
    writeFileSync(REPORT, report(outcomes, cfg.model, review));
  }, 30 * 60_000);
});
