import { after } from "next/server";
import { inboundConfig } from "@/server/forwarding";
import { processIntake, recordReceived, verifyWebhook } from "@/server/inbound";

// Resend Inbound webhook (`email.received`). The Svix signature is checked over the raw body, the email
// is recorded once, and it is processed after the 200 so Resend never waits on the invoice.
export async function POST(request: Request) {
  const config = inboundConfig();
  if (!config) return new Response(null, { status: 404 });
  const raw = await request.text();
  const event = verifyWebhook(raw, request.headers, config.secret);
  if (!event) return Response.json({ error: "invalid signature" }, { status: 401 });
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ ok: true, ignored: true });

  const intake = await recordReceived(event.data.email_id);
  if (!intake) return Response.json({ ok: true, duplicate: true });
  after(() => processIntake(intake.id, event.data).catch((e: unknown) => {
    // Left "received": the worker retries it. Never logs the email or its files.
    console.error(`[inbound] intake ${intake.id} failed: ${e instanceof Error ? e.message : "error"}`);
  }));
  return Response.json({ ok: true });
}
