import { useCallback, useEffect, useRef } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { apiBase } from "@/lib/api";

/**
 * The sign-in forms' proof of work (apps/web/src/server/captcha.ts): fetch a signed ALTCHA challenge,
 * find the number n with hex(sha256(salt + n)) === challenge, and send the result as the
 * `x-captcha-response` header. Pure JS SHA-256, so it runs the same on the web and the phone; the
 * loop yields every few thousand tries so the screen stays responsive. Nothing here is logged.
 */

type Challenge = { algorithm: string; challenge: string; maxnumber?: number; salt: string; signature: string };

const YIELD_EVERY = 2_000;
const MAX_NUMBER_CAP = 10_000_000;
// The server's challenges last 5 minutes; a solution older than this is fetched again.
const FRESH_MS = 4 * 60_000;

const utf8 = (s: string) => new TextEncoder().encode(s);

function hexBytes(hex: string) {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The smallest n in [0, maxnumber] whose sha256(salt + n) is the challenge. */
export async function solveChallenge(c: Challenge): Promise<number> {
  const target = hexBytes(c.challenge.toLowerCase());
  const max = c.maxnumber ?? 1_000_000;
  if (c.algorithm.toUpperCase() !== "SHA-256" || !target || !Number.isSafeInteger(max) || max < 0 || max > MAX_NUMBER_CAP) {
    throw new Error("captcha");
  }
  const salt = utf8(c.salt);
  const buffer = new Uint8Array(salt.length + 10);
  buffer.set(salt);
  for (let n = 0; n <= max; n++) {
    if (n > 0 && n % YIELD_EVERY === 0) await new Promise(r => setTimeout(r, 0));
    const digits = String(n);
    for (let i = 0; i < digits.length; i++) buffer[salt.length + i] = digits.charCodeAt(i);
    if (same(sha256(buffer.subarray(0, salt.length + digits.length)), target)) return n;
  }
  throw new Error("captcha");
}

/** Base64 of the JSON payload the server verifies. */
function encode(c: Challenge, number: number) {
  const json = JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number, salt: c.salt, signature: c.signature });
  let binary = "";
  for (const byte of utf8(json)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function freshSolution(): Promise<string> {
  const response = await fetch(`${apiBase()}/api/captcha`, { cache: "no-store" });
  if (!response.ok) throw new Error("captcha");
  const challenge = (await response.json()) as Challenge;
  return encode(challenge, await solveChallenge(challenge));
}

/**
 * Keeps one solution ready in the background while the form is open. `take()` hands it over (waiting
 * if it's still being solved) and starts the next, since each one works once.
 */
export function useCaptcha(enabled: boolean) {
  const next = useRef<{ at: number; solution: Promise<string> } | null>(null);

  const prepare = useCallback(() => {
    const solution = freshSolution();
    solution.catch(() => undefined);
    next.current = { at: Date.now(), solution };
  }, []);

  useEffect(() => { if (enabled) prepare(); }, [enabled, prepare]);

  return useCallback(async (): Promise<{ headers: Record<string, string> } | undefined> => {
    if (!enabled) return undefined;
    if (!next.current || Date.now() - next.current.at > FRESH_MS) prepare();
    const { solution } = next.current!;
    prepare();
    return { headers: { "x-captcha-response": await solution } };
  }, [enabled, prepare]);
}
