import { createDraft, IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PARTS, ReceiptRejected } from "@/server/receipts";
import { sampleReceiptImage } from "@/server/receipt-samples";

// Upload a receipt photo (multipart: image, zone) → a draft for the user to review. A long receipt
// sends up to MAX_PARTS `image` fields, in order from the top of the paper.
// In demo mode, `sample=<d1|jumbo|exito>` uses a recorded sample receipt instead of a photo.
export async function POST(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Envía la foto de la factura." }, { status: 400 });

  const photos: { data: Uint8Array; mime: string }[] = [];
  const sample = form.get("sample");
  if (typeof sample === "string" && sample) {
    const found = await sampleReceiptImage(sample);
    if (!found) return Response.json({ error: "No hay facturas de ejemplo disponibles." }, { status: 404 });
    photos.push({ data: found.image, mime: found.mime });
  } else {
    const files = form.getAll("image");
    if (files.length === 0 || !files.every((f) => f instanceof File)) return Response.json({ error: "Envía la foto de la factura." }, { status: 400 });
    if (files.length > MAX_PARTS) return Response.json({ error: `Envía hasta ${MAX_PARTS} fotos por factura.` }, { status: 400 });
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: "Una foto pesa más de 10 MB. Tómala de nuevo." }, { status: 413 });
      if (!IMAGE_TYPES.includes(file.type)) return Response.json({ error: "Usa fotos JPG, PNG o HEIC." }, { status: 415 });
      photos.push({ data: new Uint8Array(await file.arrayBuffer()), mime: file.type });
    }
  }
  const [first, ...more] = photos;
  const zone = form.get("zone");

  try {
    const draft = await createDraft({ sessionId, zone: typeof zone === "string" ? zone.slice(0, 60) : undefined, image: first!.data, mime: first!.mime, more });
    return Response.json(draft);
  } catch (e) {
    if (e instanceof ReceiptRejected) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
