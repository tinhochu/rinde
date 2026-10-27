import { createDraft, IMAGE_TYPES, MAX_IMAGE_BYTES, ReceiptRejected } from "@/server/receipts";
import { sampleReceiptImage } from "@/server/receipt-samples";

// Upload a receipt photo (multipart: image, zone) → a draft for the user to review.
// In demo mode, `sample=<d1|jumbo|exito>` uses a recorded sample receipt instead of a photo.
export async function POST(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Envía la foto de la factura." }, { status: 400 });

  let image: Uint8Array;
  let mime: string;
  const sample = form.get("sample");
  if (typeof sample === "string" && sample) {
    const found = await sampleReceiptImage(sample);
    if (!found) return Response.json({ error: "No hay facturas de ejemplo disponibles." }, { status: 404 });
    ({ image, mime } = found);
  } else {
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ error: "Envía la foto de la factura." }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: "La foto pesa más de 10 MB. Tómala de nuevo." }, { status: 413 });
    if (!IMAGE_TYPES.includes(file.type)) return Response.json({ error: "Usa una foto JPG, PNG o HEIC." }, { status: 415 });
    image = new Uint8Array(await file.arrayBuffer());
    mime = file.type;
  }
  const zone = form.get("zone");

  try {
    const draft = await createDraft({ sessionId, zone: typeof zone === "string" ? zone.slice(0, 60) : undefined, image, mime });
    return Response.json(draft);
  } catch (e) {
    if (e instanceof ReceiptRejected) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
