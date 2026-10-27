import { listSampleReceipts } from "@/server/receipt-samples";

// Which recorded sample receipts exist (demo mode only), for the "Probar con una factura de ejemplo" button.
export async function GET() {
  return Response.json({ samples: process.env["DEMO_RECEIPTS"] === "1" ? await listSampleReceipts() : [] });
}
