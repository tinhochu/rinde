// Forwarded e-invoice emails are processed right after Resend's webhook is answered; if the web
// server restarts mid-way, the intake stays "received". This retries those after 10 minutes by asking
// the web app to process them again (it re-lists the email's attachments from Resend).
import { db } from "@rinde/db";

const STALE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;

export async function retryStaleIntakes(opts: { now?: Date; fetch?: typeof fetch; webUrl?: string; secret?: string } = {}) {
  const secret = opts.secret ?? process.env["RESEND_WEBHOOK_SECRET"];
  if (!secret) return { retried: 0 };
  const now = opts.now ?? new Date();
  const fetcher = opts.fetch ?? globalThis.fetch;
  const webUrl = (opts.webUrl ?? process.env["WEB_INTERNAL_URL"] ?? "http://web:3000").replace(/\/$/, "");
  const prisma = db();
  const stale = await prisma.invoiceIntake.findMany({
    where: { status: "received", resendEmailId: { not: null }, attempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    select: { id: true, updatedAt: true }, orderBy: { createdAt: "asc" }, take: 20,
  });
  let retried = 0;
  for (const intake of stale) {
    // Claim it: another run that read the same row finds it touched and skips it.
    const claimed = await prisma.invoiceIntake.updateMany({ where: { id: intake.id, status: "received", updatedAt: intake.updatedAt }, data: { updatedAt: now } });
    if (claimed.count === 0) continue;
    const response = await fetcher(`${webUrl}/api/inbound/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ intakeId: intake.id }),
      signal: AbortSignal.timeout(120_000),
    }).catch((e: unknown) => ({ ok: false, status: e instanceof Error ? e.message : "error" }));
    if (!response.ok) console.warn(`[worker] intake retry ${intake.id} failed: ${response.status}`);
    retried++;
  }
  return { retried };
}
