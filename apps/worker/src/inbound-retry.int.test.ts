import { afterAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";
import { retryStaleIntakes } from "./inbound-retry";

// Runs against the dev database: INTEGRATION=1 pnpm --filter @rinde/worker test
describe.skipIf(!process.env["INTEGRATION"])("retryStaleIntakes (dev DB)", () => {
  const run = `test-retry-${Date.now()}`;
  afterAll(() => db().invoiceIntake.deleteMany({ where: { resendEmailId: { startsWith: run } } }));

  it("asks the web app to process a stale intake once, and leaves fresh ones alone", async () => {
    const now = new Date();
    const stale = await db().invoiceIntake.create({ data: { via: "email", resendEmailId: `${run}-stale`, status: "received" } });
    const fresh = await db().invoiceIntake.create({ data: { via: "email", resendEmailId: `${run}-fresh`, status: "received" } });
    // Backdate the stale one past the 10 minutes.
    await db().$executeRaw`UPDATE "InvoiceIntake" SET "updatedAt" = now() - interval '11 minutes' WHERE id = ${stale.id}`;

    const calls: { url: string; auth: string | null; body: unknown }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
      // The web app processes it: the intake leaves "received".
      await db().invoiceIntake.update({ where: { id: stale.id }, data: { status: "rejected", message: "x" } });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const later = new Date(now.getTime() + 60_000);
    const first = await retryStaleIntakes({ now: later, fetch: fetcher, webUrl: "http://web:3000", secret: "whsec_x" });
    const second = await retryStaleIntakes({ now: new Date(later.getTime() + 20 * 60_000), fetch: fetcher, webUrl: "http://web:3000", secret: "whsec_x" });
    const ours = calls.filter((c) => [stale.id, fresh.id].includes((c.body as { intakeId: string }).intakeId));
    expect(first.retried).toBeGreaterThanOrEqual(1);
    expect(ours.filter((c) => (c.body as { intakeId: string }).intakeId === stale.id)).toHaveLength(1);
    expect(ours[0]).toMatchObject({ url: "http://web:3000/api/inbound/retry", auth: "Bearer whsec_x" });
    // The fresh one became stale only for the second run (20 minutes later), so it is retried then, once.
    expect(ours.filter((c) => (c.body as { intakeId: string }).intakeId === fresh.id)).toHaveLength(1);
    void second;
  });
});
