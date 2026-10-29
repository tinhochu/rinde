import { connection } from "next/server";
import { issueChallenge } from "@/server/captcha";

// A fresh ALTCHA challenge for the sign-in forms; never cached. Limited per client address.
export async function GET(request: Request) {
  await connection();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const challenge = await issueChallenge(address);
  if (!challenge) return Response.json({ error: "Pediste muchas verificaciones seguidas. Espera un rato e inténtalo de nuevo." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  return Response.json(challenge, { headers: { "Cache-Control": "no-store" } });
}
