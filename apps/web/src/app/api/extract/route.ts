import { MuseUnavailable } from "@/server/muse";
import { readListPhoto } from "@/server/list-photo";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

// Photo of a shopping list (multipart: photo) → list items, read by Meta Muse vision. Never prices.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return Response.json({ error: "Envía la foto de tu lista." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "La foto pesa más de 8 MB. Tómala de nuevo." }, { status: 413 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Usa una foto JPG, PNG o WebP." }, { status: 415 });
  try {
    const items = await readListPhoto({ data: new Uint8Array(await file.arrayBuffer()), mime: file.type });
    return Response.json({ items });
  } catch (e) {
    if (e instanceof MuseUnavailable) {
      return Response.json({ error: "No pudimos leer la foto ahora. Pega tu lista o búscala producto por producto." }, { status: 503 });
    }
    throw e;
  }
}
