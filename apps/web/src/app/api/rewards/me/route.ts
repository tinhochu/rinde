import { db } from "@rinde/db";
import { rewardsFor } from "@/server/rewards";

// The device's points, badges, history and weekly rank. Before the first receipt: zero and no badges.
export async function GET(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const mine = await rewardsFor(db(), sessionId);
  return Response.json(mine ?? { points: 0, name: "", zone: "", badges: [], history: [], rank: null }, { headers: { "Cache-Control": "no-store" } });
}
