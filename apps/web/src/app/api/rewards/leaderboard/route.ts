import { z } from "zod";
import { db } from "@rinde/db";
import { leaderboard } from "@/server/rewards";

const querySchema = z.object({ zone: z.string().trim().min(2).max(60) });

// This week's top 10 in a zone, plus the caller's own position when they have one.
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Elige una zona." }, { status: 400 });
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  const prisma = db();
  const me = sessionId ? await prisma.contributor.findUnique({ where: { sessionId }, select: { id: true } }) : null;
  const board = await leaderboard(prisma, parsed.data.zone, { contributorId: me?.id });
  return Response.json(board, { headers: { "Cache-Control": "no-store" } });
}
