// Photo → shopping list via Meta Muse vision. Pending Meta Model API access.
export async function POST() {
  if (!process.env["META_API_KEY"]) {
    return Response.json(
      { error: "Leer listas desde fotos aún no está disponible. Escribe tu lista o agrégala a mano." },
      { status: 503 },
    );
  }
  return Response.json({ error: "Lectura de fotos en construcción." }, { status: 501 });
}
