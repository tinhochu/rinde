import { EINVOICE_MESSAGES } from "@/server/einvoice";
import { draftFor } from "@/server/receipts";

// A draft to review again (inbox, or the link in a reply email). Only the session that owns it gets it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const draft = await draftFor(sessionId, (await params).id.slice(0, 40));
  if (!draft) return Response.json({ error: EINVOICE_MESSAGES.elsewhere, code: "not_found" }, { status: 404 });
  return Response.json(draft);
}
