import { timingSafeEqual } from "node:crypto";
import { inboundConfig } from "@/server/forwarding";
import { processIntake } from "@/server/inbound";

// The worker's retry of an intake left "received" (e.g. the server restarted mid-processing).
// Internal: authorized with the webhook secret, never exposed to the app.
export async function POST(request: Request) {
  const config = inboundConfig();
  if (!config) return new Response(null, { status: 404 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(config.secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response(null, { status: 401 });
  const body = (await request.json().catch(() => null)) as { intakeId?: unknown } | null;
  if (typeof body?.intakeId !== "string") return Response.json({ error: "intakeId" }, { status: 400 });
  await processIntake(body.intakeId.slice(0, 40));
  return Response.json({ ok: true });
}
