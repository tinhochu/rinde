import { z } from "zod";
import { db } from "@rinde/db";
import { rewardsFor } from "@/server/rewards";

const nameSchema = z.object({
  // Shown on the neighborhood ranking: letters, numbers, spaces and a few marks; empty goes back to "Vecino #…".
  name: z.string().trim().max(24).regex(/^[\p{L}\p{N} .'-]*$/u, "Usa letras, números y espacios."),
});

// The device's points, badges, history and weekly rank. Before the first receipt: zero and no badges.
export async function GET(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const mine = await rewardsFor(db(), sessionId);
  return Response.json(mine ?? { points: 0, name: "", zone: "", badges: [], history: [], rank: null }, { headers: { "Cache-Control": "no-store" } });
}

// Sets the name shown on the ranking.
export async function PATCH(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Ese nombre no es válido." }, { status: 400 });
  const displayName = parsed.data.name || null;
  const prisma = db();
  await prisma.contributor.upsert({ where: { sessionId }, create: { sessionId, displayName }, update: { displayName } });
  return Response.json(await rewardsFor(prisma, sessionId), { headers: { "Cache-Control": "no-store" } });
}
