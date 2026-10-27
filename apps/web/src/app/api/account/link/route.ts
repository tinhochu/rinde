import { currentUser } from "@/server/auth";
import { linkDevice } from "@/server/account";

// After sign-in: carry this device's receipts and points into the account. Returns the session id to keep.
export async function POST(request: Request) {
  const user = await currentUser(request.headers);
  if (!user) return Response.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const linked = await linkDevice(user.id, sessionId);
  return Response.json({ ...linked, user: { name: user.name, email: user.email } }, { headers: { "Cache-Control": "no-store" } });
}
