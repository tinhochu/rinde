import { newAddress } from "@/server/inbox";
import { contributorFor } from "@/server/receipts";

// "Cambiar dirección": the old forwarding address stops accepting invoices.
export async function POST(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const contributor = await contributorFor(sessionId);
  const address = await newAddress(contributor.id);
  if (!address) return Response.json({ error: "Recibir facturas por correo no está disponible." }, { status: 404 });
  return Response.json({ address });
}
