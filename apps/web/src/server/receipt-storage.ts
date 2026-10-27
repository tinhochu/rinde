import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Receipt photos on local disk (a Docker volume in production, RECEIPTS_DIR). Kept behind these
 * three functions so moving to object storage (e.g. an Appwrite bucket) touches only this file.
 * Photos are never served publicly.
 */
const dir = () => process.env["RECEIPTS_DIR"] || path.join(process.cwd(), ".data", "receipts");

/** Saves one photo; the parts of a long receipt after the first are `<id>-<part>.img` beside it. */
export async function saveReceiptImage(receiptId: string, data: Uint8Array, part = 0): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const file = path.join(dir(), part ? `${receiptId}-${part}.img` : `${receiptId}.img`);
  await writeFile(file, data);
  return file;
}

export function readReceiptImage(file: string): Promise<Buffer> {
  return readFile(file);
}

export async function deleteReceiptImage(file: string): Promise<void> {
  await rm(file, { force: true });
}
