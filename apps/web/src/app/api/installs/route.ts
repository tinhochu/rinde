import { countInstallEvent, installEventSchema, installStats } from "@/server/installs";

// Anonymous install counters from the PWA (see packages/db InstallCount).
export async function POST(request: Request) {
  const parsed = installEventSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Evento no válido." }, { status: 400 });
  await countInstallEvent(parsed.data);
  return new Response(null, { status: 204 });
}

// GET /api/installs?days=14: the counters and totals.
export async function GET(request: Request) {
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14));
  return Response.json(await installStats(days), { headers: { "Cache-Control": "no-store" } });
}
