import { cursorFits, decodeCursor, deunaError, deunaGuard, deunaJson, deunaStore, listProducts, productsQuerySchema } from "@/server/deuna";

// DeUna (service to service): one page of a store's priced products, searched or browsed. See docs/deuna-api.md.
export async function GET(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const denied = deunaGuard(request);
  if (denied) return denied;
  const slug = deunaStore((await params).storeId);
  if (!slug) return deunaError(404, "not_found", "Unknown store.");

  const parsed = productsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return deunaError(400, "invalid_request", "Invalid query parameters.", parsed.error.issues);
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && (!cursor || !cursorFits(cursor, parsed.data))) {
    return deunaError(400, "invalid_request", "Invalid query parameters.", [{ code: "custom", path: ["cursor"], message: "cursor does not belong to this query", input: parsed.data.cursor }]);
  }
  return deunaJson(await listProducts(slug, parsed.data, cursor));
}
