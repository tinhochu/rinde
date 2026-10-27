import { inboxFor } from "@/server/inbox";
import { contributorFor } from "@/server/receipts";

// E-invoices for this device: its forwarding address, drafts waiting for review, recent emailed outcomes.
export async function GET(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const contributor = await contributorFor(sessionId);
  return Response.json(await inboxFor(contributor.id));
}
