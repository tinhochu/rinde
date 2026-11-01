import { deunaError, deunaGuard, deunaJson, deunaStore, findProduct } from "@/server/deuna";

// DeUna (service to service): one priced product by the store's SKU. See docs/deuna-api.md.
export async function GET(request: Request, { params }: { params: Promise<{ storeId: string; sku: string }> }) {
  const denied = deunaGuard(request);
  if (denied) return denied;
  const { storeId, sku } = await params;
  const slug = deunaStore(storeId);
  if (!slug) return deunaError(404, "not_found", "Unknown store.");
  if (sku.length > 150) return deunaError(404, "not_found", "No priced product with that sku.");
  const item = await findProduct(slug, sku);
  if (!item) return deunaError(404, "not_found", "No priced product with that sku.");
  return deunaJson(item);
}
