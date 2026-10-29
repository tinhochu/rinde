import { describe, expect, it } from "vitest";
import { solveChallenge } from "altcha-lib/v1";
import { CAPTCHA_TTL_SECONDS, issueChallenge, spendSolution, type CaptchaChallenge } from "./captcha";

process.env["BETTER_AUTH_SECRET"] ??= "test-secret";

async function solve(c: CaptchaChallenge, number?: number) {
  const found = await solveChallenge(c.challenge, c.salt, "SHA-256", c.maxnumber).promise;
  const payload = { algorithm: "SHA-256", challenge: c.challenge, number: number ?? found!.number, salt: c.salt, signature: c.signature };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("self-hosted captcha", () => {
  it("accepts a solved challenge once", async () => {
    const value = await solve((await issueChallenge("a"))!);
    expect(await spendSolution(value)).toBeNull();
    expect(await spendSolution(value)).toBe("REUSED");
  });

  it("refuses a missing, malformed, wrong or expired solution", async () => {
    expect(await spendSolution(null)).toBe("MISSING");
    expect(await spendSolution("not base64 json")).toBe("MALFORMED");
    const c = (await issueChallenge("b"))!;
    const right = JSON.parse(Buffer.from(await solve(c), "base64").toString()).number as number;
    expect(await spendSolution(await solve(c, right + 1))).toBe("UNSOLVED");
    const later = Date.now() + (CAPTCHA_TTL_SECONDS + 1) * 1000;
    expect(await spendSolution(await solve(c), later)).toBe("EXPIRED");
  });

  it("refuses a challenge signed with another key", async () => {
    const c = (await issueChallenge("c"))!;
    const forged = await solve({ ...c, signature: "0".repeat(64) });
    expect(await spendSolution(forged)).toBe("UNSOLVED");
  });

  it("limits challenges per address per hour", async () => {
    const now = Date.now();
    for (let i = 0; i < 60; i++) expect(await issueChallenge("busy", now)).not.toBeNull();
    expect(await issueChallenge("busy", now)).toBeNull();
    expect(await issueChallenge("someone-else", now)).not.toBeNull();
  });
});
