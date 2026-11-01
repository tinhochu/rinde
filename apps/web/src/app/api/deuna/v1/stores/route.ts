import { deunaGuard, deunaJson, listStores } from "@/server/deuna";

// DeUna (service to service): the stores whose online catalogue it can read. See docs/deuna-api.md.
export async function GET(request: Request) {
  const denied = deunaGuard(request);
  if (denied) return denied;
  return deunaJson({ stores: await listStores() });
}
