import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@rinde/db";

vi.mock("./muse", async (orig) => {
  const actual = await orig<typeof import("./muse")>();
  return {
    ...actual,
    extractReceipt: async () => { throw new actual.MuseUnavailable("mocked outage"); },
    chooseCandidates: async () => { throw new actual.MuseUnavailable("mocked"); },
  };
});
vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_dGVzdC1zZWNyZXQtZm9yLXJpbmRlLXRlc3Rz");
vi.stubEnv("INBOUND_EMAIL_DOMAIN", "rinde-test.resend.app");

const upload = (await import("@/app/api/receipts/einvoice/route")).POST;
const inbox = (await import("@/app/api/receipts/inbox/route")).GET;
const rotate = (await import("@/app/api/receipts/inbox/address/route")).POST;
const draftRoute = (await import("@/app/api/receipts/[id]/route")).GET;
const inbound = (await import("@/app/api/inbound/email/route")).POST;
const { EINVOICE_MESSAGES } = await import("./einvoice");
const { resolveRecipient } = await import("./forwarding");
const { cleanupContributors } = await import("./receipt-fixture");

const RUN = `test-einvr-${Date.now()}`;
const session = (n: string) => `${RUN}-${n}`;
const FIXTURES = path.join(import.meta.dirname, "../../../../packages/core/src/einvoice/fixtures");

/** The Éxito fixture issued two hours ago with its own CUFE and number. */
function exitoZip() {
  const cufe = createHash("sha384").update(RUN).digest("hex");
  // Each test file issues its invoices at its own hour: files run in parallel on one database, and two
  // invoices from the same branch, minute and total would be taken for the same purchase.
  const local = new Date(Date.now() - 5 * 3_600_000 - 5 * 3_600_000).toISOString();
  const xml = readFileSync(path.join(FIXTURES, "exito.xml"), "utf8")
    .replace(/0d87f960718cc4c279feec708b35a4d298d8bbc88b339cc9d6d23327b73c9c81731ecca8117f49e60ad9116aca3eecf4/g, cufe)
    .replaceAll("QZ9667377", `QZ96${RUN.slice(-8)}`)
    .replaceAll("<cbc:IssueDate>2026-10-26</cbc:IssueDate><cbc:IssueTime>18:19:19-05:00</cbc:IssueTime>",
      `<cbc:IssueDate>${local.slice(0, 10)}</cbc:IssueDate><cbc:IssueTime>${local.slice(11, 19)}-05:00</cbc:IssueTime>`);
  return zipSync({ "ad0890.xml": strToU8(xml) });
}

function form(name: string, data: Uint8Array, sessionId: string) {
  const body = new FormData();
  body.append("file", new File([data as BlobPart], name));
  return new Request("http://localhost/api/receipts/einvoice", { method: "POST", headers: { "x-rinde-session": sessionId }, body });
}
const get = (url: string, sessionId: string) => new Request(url, { headers: { "x-rinde-session": sessionId } });

describe.skipIf(!process.env["INTEGRATION"])("e-invoice routes (dev DB)", () => {
  afterAll(() => cleanupContributors(RUN));
  let draftId = "";

  it("uploads the invoice zip and answers with the draft", async () => {
    const response = await upload(form("089090060802126QZ9667377.zip", exitoZip(), session("a")));
    expect(response.status).toBe(200);
    const draft = await response.json();
    expect(draft).toMatchObject({ store: "Éxito", source: "einvoice", dianConfirmed: true, total: 16100 });
    draftId = draft.id;
    const intake = await db().invoiceIntake.findFirstOrThrow({ where: { contributor: { sessionId: session("a") } } });
    expect(intake).toMatchObject({ via: "upload", status: "accepted", receiptId: draftId, store: "exito" });
  });

  it("refuses a .docx and a file over 10 MB", async () => {
    const docx = await upload(form("factura.docx", zipSync({ "word/document.xml": strToU8("<w/>") }), session("a")));
    expect(docx.status).toBe(415);
    expect(await docx.json()).toEqual({ error: EINVOICE_MESSAGES.type, code: "type" });
    expect((await upload(form("big.zip", new Uint8Array(10 * 1024 * 1024 + 1), session("a")))).status).toBe(413);
  });

  it("lists the draft to review and creates the forwarding address on first view", async () => {
    const before = await db().forwardingAddress.count({ where: { contributor: { sessionId: session("a") } } });
    expect(before).toBe(0);
    const body = await (await inbox(get("http://localhost/api/receipts/inbox", session("a")))).json();
    expect(body.address).toMatch(/^facturas\+[a-z2-7]{10}@rinde-test\.resend\.app$/);
    expect(body.drafts).toEqual([expect.objectContaining({ id: draftId, store: "Éxito", lines: 2 })]);
    expect(body.recent).toEqual([]);
    const again = await (await inbox(get("http://localhost/api/receipts/inbox", session("a")))).json();
    expect(again.address).toBe(body.address);
  });

  it("replaces the address: the old one stops resolving", async () => {
    const old = (await (await inbox(get("http://localhost/api/receipts/inbox", session("a")))).json()).address as string;
    const { address } = await (await rotate(new Request("http://localhost/api/receipts/inbox/address", { method: "POST", headers: { "x-rinde-session": session("a") } }))).json();
    expect(address).not.toBe(old);
    expect(await resolveRecipient([old])).toBeNull();
    expect((await resolveRecipient([address]))?.active).toBe(true);
    expect((await (await inbox(get("http://localhost/api/receipts/inbox", session("a")))).json()).address).toBe(address);
  });

  it("opens a draft only for the session that owns it", async () => {
    const mine = await draftRoute(get(`http://localhost/api/receipts/${draftId}`, session("a")), { params: Promise.resolve({ id: draftId }) });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ id: draftId, lines: [expect.objectContaining({ total: 8600, check: "ok" }), expect.anything()] });
    const other = await draftRoute(get(`http://localhost/api/receipts/${draftId}`, session("b")), { params: Promise.resolve({ id: draftId }) });
    expect(other.status).toBe(404);
    expect((await other.json()).error).toBe(EINVOICE_MESSAGES.elsewhere);
  });

  it("returns no address while receiving email is off, and uploads still work", async () => {
    vi.stubEnv("INBOUND_EMAIL_DOMAIN", "");
    const webhook = await inbound(new Request("http://localhost/api/inbound/email", { method: "POST", body: "{}" }));
    expect(webhook.status).toBe(404);
    const body = await (await inbox(get("http://localhost/api/receipts/inbox", session("c")))).json();
    expect(body.address).toBeNull();
    const surtimax = readFileSync(path.join(FIXTURES, "carulla.xml"), "utf8").replaceAll("CARULLA EXPRESS EDS EL RETIRO", "SURTIMAX CALDAS");
    const response = await upload(form("ad.xml", new TextEncoder().encode(surtimax), session("c")));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Por ahora leemos facturas de D1, Jumbo, Éxito y Carulla.");
    vi.stubEnv("INBOUND_EMAIL_DOMAIN", "rinde-test.resend.app");
  });
});
