import "server-only";
import { createHash } from "node:crypto";
import { createChallenge, extractParams, verifySolution } from "altcha-lib/v1";

/**
 * Self-hosted ALTCHA proof of work in front of sign-up, password sign-in and code requests: the
 * server signs a challenge, the app finds the number that solves it (about a second, in the
 * background), and each solution is accepted once. No third party and nothing about the visitor
 * leaves this server. It raises the cost of scripted attempts; the auth rate limits stay.
 */

/** Seconds a challenge stays solvable. */
export const CAPTCHA_TTL_SECONDS = 300;
/** Upper bound of the number to find: about 50 000 SHA-256 tries on average. */
export const CAPTCHA_MAX_NUMBER = 100_000;
/** Challenges per client address per hour: a few per form, for reloads and expired ones. */
const CHALLENGES_PER_HOUR = 60;

export type CaptchaChallenge = { algorithm: string; challenge: string; maxnumber?: number; salt: string; signature: string };
export type CaptchaRejection = "MISSING" | "MALFORMED" | "EXPIRED" | "UNSOLVED" | "REUSED";

// ALTCHA_HMAC_KEY when set; otherwise derived from the auth secret, so it works without extra setup.
function hmacKey() {
  const own = process.env["ALTCHA_HMAC_KEY"];
  if (own) return own;
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (!secret) throw new Error("ALTCHA_HMAC_KEY or BETTER_AUTH_SECRET must be set");
  return createHash("sha256").update(`rinde-altcha:${secret}`).digest("hex");
}

// One web container, so memory is enough: used signatures until their challenge would expire, and
// challenge counts per address for the current hour. A restart forgets both, which only resets limits.
const used = new Map<string, number>();
const issued = new Map<string, { hour: number; count: number }>();

function prune(now: number) {
  for (const [key, until] of used) if (until <= now) used.delete(key);
  const hour = Math.floor(now / 3_600_000);
  for (const [key, entry] of issued) if (entry.hour !== hour) issued.delete(key);
}

/** A new challenge, or null when this address asked for too many this hour. */
export async function issueChallenge(clientKey: string, now = Date.now()): Promise<CaptchaChallenge | null> {
  prune(now);
  const hour = Math.floor(now / 3_600_000);
  const key = createHash("sha256").update(clientKey).digest("hex");
  const entry = issued.get(key) ?? { hour, count: 0 };
  if (entry.count >= CHALLENGES_PER_HOUR) return null;
  issued.set(key, { hour, count: entry.count + 1 });
  const c = await createChallenge({
    algorithm: "SHA-256",
    hmacKey: hmacKey(),
    maxnumber: CAPTCHA_MAX_NUMBER,
    expires: new Date(now + CAPTCHA_TTL_SECONDS * 1000),
  });
  return { algorithm: c.algorithm, challenge: c.challenge, maxnumber: c.maxnumber, salt: c.salt, signature: c.signature };
}

type Payload = { algorithm: "SHA-256"; challenge: string; number: number; salt: string; signature: string };

function decode(value: string): Payload | null {
  try {
    const p = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>;
    const hex = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
    if (p["algorithm"] !== "SHA-256" || !hex(p["challenge"]) || !hex(p["signature"])) return null;
    if (typeof p["salt"] !== "string" || !p["salt"] || p["salt"].length > 512) return null;
    if (!Number.isSafeInteger(p["number"]) || (p["number"] as number) < 0) return null;
    return { algorithm: "SHA-256", challenge: p["challenge"] as string, number: p["number"] as number, salt: p["salt"], signature: p["signature"] as string };
  } catch {
    return null;
  }
}

/** Null when the solution is valid and now spent; otherwise why it was refused. */
export async function spendSolution(value: string | null | undefined, now = Date.now()): Promise<CaptchaRejection | null> {
  if (!value) return "MISSING";
  const payload = decode(value);
  if (!payload) return "MALFORMED";
  // The expiry is part of the signed salt, so it can't be moved without breaking the signature.
  const expires = Number(extractParams(payload)["expires"]);
  if (!Number.isSafeInteger(expires)) return "MALFORMED";
  if (expires * 1000 <= now) return "EXPIRED";
  if (!(await verifySolution(payload, hmacKey(), false).catch(() => false))) return "UNSOLVED";
  prune(now);
  const key = createHash("sha256").update(payload.signature).digest("hex");
  if (used.has(key)) return "REUSED";
  used.set(key, expires * 1000);
  return null;
}
