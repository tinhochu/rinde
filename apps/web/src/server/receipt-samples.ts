import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURES_DIR } from "./muse";

/** Sample receipts for demo mode: `<store>.jpg` beside its recorded `<store>.json` in fixtures/receipts. */
export async function listSampleReceipts(): Promise<string[]> {
  const files = await readdir(FIXTURES_DIR).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith(".jpg") && files.includes(f.replace(/\.jpg$/, ".json"))).map((f) => f.replace(/\.jpg$/, ""));
}

export async function sampleReceiptImage(name: string): Promise<{ image: Uint8Array; mime: string } | null> {
  if (process.env["DEMO_RECEIPTS"] !== "1" || !/^[a-z0-9-]+$/.test(name)) return null;
  const data = await readFile(path.join(FIXTURES_DIR, `${name}.jpg`)).catch(() => null);
  return data ? { image: new Uint8Array(data), mime: "image/jpeg" } : null;
}
