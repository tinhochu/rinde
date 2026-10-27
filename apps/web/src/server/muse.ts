import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Extraction } from "@rinde/core";

/**
 * Meta Model API adapter (Muse). Uses the OpenAI-compatible Responses API at META_API_BASE_URL.
 * The model only transcribes and chooses among given options; it never supplies a price.
 */
export class MuseUnavailable extends Error {}

export interface MuseConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetch: typeof fetch;
}

export function museConfig(): MuseConfig {
  return {
    apiKey: process.env["META_API_KEY"] || undefined,
    baseUrl: (process.env["META_API_BASE_URL"] || "https://api.meta.ai/v1").replace(/\/$/, ""),
    model: process.env["META_VISION_MODEL"] || "muse-spark-1.3",
    timeoutMs: 30_000,
    fetch: globalThis.fetch,
  };
}

type Image = { data: Uint8Array; mime: string };

/** One structured call: strict JSON schema out, zod-validated. Retries once on 5xx or invalid JSON. */
export async function museJson<T>(
  instruction: string,
  format: { name: string; schema: Record<string, unknown> },
  validate: z.ZodType<T>,
  opts: { image?: Image; effort?: "low" | "medium" | "high" } = {},
  cfg: MuseConfig = museConfig(),
): Promise<T> {
  if (!cfg.apiKey) throw new MuseUnavailable("META_API_KEY is not set");
  const content: unknown[] = [{ type: "input_text", text: instruction }];
  if (opts.image) {
    const b64 = Buffer.from(opts.image.data).toString("base64");
    content.push({ type: "input_image", image_url: `data:${opts.image.mime};base64,${b64}` });
  }
  const body = JSON.stringify({
    model: cfg.model,
    input: [{ type: "message", role: "user", content }],
    text: { format: { type: "json_schema", name: format.name, strict: true, schema: format.schema } },
    // The API reasons at "high" effort by default; quick sorting tasks ask for less to stay fast.
    ...(opts.effort ? { reasoning: { effort: opts.effort } } : {}),
  });

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await cfg.fetch(`${cfg.baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (e) {
      // Timeouts spend the whole budget; don't retry them.
      throw new MuseUnavailable(e instanceof Error ? e.message : "request failed");
    }
    if (response.status >= 500) { lastError = `HTTP ${response.status}`; continue; }
    if (!response.ok) throw new MuseUnavailable(`HTTP ${response.status}`);
    const parsed = validate.safeParse(safeJson(outputText(await response.json())));
    if (parsed.success) return parsed.data;
    lastError = "invalid JSON from model";
  }
  throw new MuseUnavailable(lastError);
}

/** Text of the final message in a Responses API result (reasoning items are skipped). */
function outputText(result: unknown): string {
  const r = result as { output_text?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (typeof r.output_text === "string") return r.output_text;
  return (r.output ?? [])
    .filter((o) => o.type === "message" || o.content)
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" || typeof c.text === "string")
    .map((c) => c.text ?? "")
    .join("");
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

// ── Receipts ────────────────────────────────────────────────────────────────

const str = { type: "string" } as const;
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["store", "branch", "purchased_at", "total", "invoice_number", "cufe", "lines"],
  properties: {
    store: str, branch: str, purchased_at: str, total: str, invoice_number: str, cufe: str,
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "code", "quantity", "unit_price", "total"],
        properties: { kind: { type: "string", enum: ["item", "discount"] }, text: str, code: str, quantity: str, unit_price: str, total: str },
      },
    },
  },
};

const extractionSchema: z.ZodType<Extraction> = z.object({
  store: z.string(), branch: z.string(), purchased_at: z.string(), total: z.string(), invoice_number: z.string(), cufe: z.string(),
  lines: z.array(z.object({
    kind: z.enum(["item", "discount"]), text: z.string(), code: z.string(), quantity: z.string(), unit_price: z.string(), total: z.string(),
  })).max(200),
});

const RECEIPT_INSTRUCTION = `You transcribe a photo of a Colombian supermarket receipt (factura or tiquete POS).
Copy every value exactly as printed. Never compute, estimate, round or correct a number; if a value is not legible, use an empty string.
Do NOT include the customer's name, the customer's ID (CC, cédula or the customer's NIT), card numbers, or payment authorization codes anywhere.
- store: the store brand and legal name printed at the top (for example "TIENDAS D1 - KOBA COLOMBIA S.A.S").
- branch: the branch or store location name, if printed.
- purchased_at: the purchase date and time as printed.
- total: the final total to pay, as printed.
- invoice_number: the invoice or document number with its prefix (for example "POS 1234-567890" or "FE 12345").
- cufe: the CUFE code if printed, otherwise empty.
- lines: one entry per purchased product, in order. kind "discount" for discount or promotion lines (keep the printed sign).
  text: the product description as printed. code: the EAN, PLU or item code if printed. quantity: as printed including the unit (for example "2" or "0,845 KG"), empty if not printed.
  unit_price: the unit or per-kg price as printed, empty if not printed. total: the line total as printed.
Do not include subtotal, tax (IVA), payment, change or bag-tax summary lines as products.`;

export type ReceiptExtraction = { extraction: Extraction; demo: boolean };

/**
 * Reads a receipt photo. When the API is unavailable and DEMO_RECEIPTS=1, a recorded extraction
 * for a known sample photo (matched by SHA-256) is returned instead, flagged demo.
 */
export async function extractReceipt(image: Image, cfg: MuseConfig = museConfig()): Promise<ReceiptExtraction> {
  try {
    const extraction = await museJson(RECEIPT_INSTRUCTION, { name: "receipt", schema: EXTRACTION_SCHEMA }, extractionSchema, { image }, cfg);
    return { extraction, demo: false };
  } catch (e) {
    if (!(e instanceof MuseUnavailable)) throw e;
    if (process.env["DEMO_RECEIPTS"] === "1") {
      const fixture = await demoFixture(sha256(image.data));
      if (fixture) return { extraction: fixture, demo: true };
    }
    throw e;
  }
}

export function sha256(data: Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}

export const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "receipts");

/** Recorded sample receipts: `<name>.json` = { imageSha256, extraction }, beside `<name>.jpg`. */
export async function demoFixture(imageSha256: string, dir = FIXTURES_DIR): Promise<Extraction | null> {
  const files = await readdir(dir).catch(() => [] as string[]);
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    const fixture = JSON.parse(await readFile(path.join(dir, f), "utf8")) as { imageSha256: string; extraction: Extraction };
    if (fixture.imageSha256 === imageSha256) return fixture.extraction;
  }
  return null;
}

// ── Matching ────────────────────────────────────────────────────────────────

export type CandidateOption = { id: string; name: string; size: string };

/**
 * Asks the model which listing each receipt line is, choosing only among that line's given ids,
 * in a single call. Any id it invents is discarded: each result is one of the line's ids or null.
 */
export async function chooseCandidates(
  store: string,
  lines: { index: number; text: string; candidates: CandidateOption[] }[],
  cfg: MuseConfig = museConfig(),
): Promise<Map<number, string | null>> {
  const asked = lines.filter((l) => l.candidates.length > 0);
  if (asked.length === 0) return new Map();
  const blocks = asked.map((l) => `Line ${l.index}: "${l.text}"\n` + l.candidates.map((c) => `  ${c.id}: ${c.name}${c.size ? ` (${c.size})` : ""}`).join("\n")).join("\n\n");
  const instruction = `These lines come from a ${store} receipt; receipt descriptions are abbreviated.
For each line, answer with the id of the ${store} product it is, chosen only from that line's list, or "none" if no product clearly matches (same product type, and the same brand and size when they are printed).

${blocks}`;
  const result = await museJson(
    instruction,
    {
      name: "choices",
      schema: {
        type: "object", additionalProperties: false, required: ["choices"],
        properties: { choices: { type: "array", items: { type: "object", additionalProperties: false, required: ["line", "id"], properties: { line: { type: "integer" }, id: { type: "string" } } } } },
      },
    },
    z.object({ choices: z.array(z.object({ line: z.number().int(), id: z.string() })) }),
    {},
    cfg,
  );
  const out = new Map<number, string | null>();
  for (const l of asked) {
    const id = result.choices.find((c) => c.line === l.index)?.id;
    out.set(l.index, l.candidates.some((c) => c.id === id) ? id! : null);
  }
  return out;
}

export async function chooseCandidate(lineText: string, store: string, candidates: CandidateOption[], cfg: MuseConfig = museConfig()): Promise<string | null> {
  return (await chooseCandidates(store, [{ index: 0, text: lineText, candidates }], cfg)).get(0) ?? null;
}
