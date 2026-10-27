import { basicsFor, basicsRequestSchema } from "@/server/basics";
import { enabledRetailers } from "@/server/offers";

// The device's own staples (from its receipts and what it picked from search) with today's prices.
export async function POST(request: Request) {
  const parsed = basicsRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "No pudimos leer tu historial." }, { status: 400 });
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64) ?? null;
  const items = await basicsFor(sessionId, parsed.data, enabledRetailers());
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
