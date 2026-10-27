import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { Webhook } from "svix";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@rinde/db";

const SECRET = "whsec_dGVzdC1zZWNyZXQtZm9yLXJpbmRlLXRlc3Rz";
vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
vi.stubEnv("INBOUND_EMAIL_DOMAIN", "rinde-test.resend.app");
vi.stubEnv("RESEND_API_KEY", "re_test");
vi.stubEnv("EMAIL_FROM", "Rinde <facturas@rinde.test>");
vi.stubEnv("APP_URL", "https://rinde.test");

// `after()` needs a live request; here its work is collected and awaited by the test.
const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<unknown>) => { pending.push(fn()); } }));
vi.mock("./muse", async (orig) => {
  const actual = await orig<typeof import("./muse")>();
  return { ...actual, extractReceipt: async () => { throw new actual.MuseUnavailable("mocked"); }, chooseCandidates: async () => { throw new actual.MuseUnavailable("mocked"); } };
});

// Resend's API, mocked: attachment lists and downloads per email id, and every sent email.
const resend = vi.hoisted(() => ({ attachments: new Map<string, { filename: string; data: Uint8Array }[]>(), calls: [] as string[], sent: [] as { to: string[]; subject: string; text: string; html: string }[] }));
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  resend.calls.push(url);
  if (url === "https://api.resend.com/emails") { resend.sent.push(JSON.parse(String(init!.body))); return Response.json({ id: "sent" }); }
  const list = url.match(/\/emails\/receiving\/([^/]+)\/attachments$/);
  if (list) {
    const files = resend.attachments.get(decodeURIComponent(list[1]!)) ?? [];
    return Response.json({ object: "list", has_more: false, data: files.map((f, i) => ({ id: `${i}`, filename: f.filename, size: f.data.length, content_type: f.filename.endsWith(".jpg") ? "image/jpeg" : "application/zip", download_url: `https://files.resend.test/${list[1]}/${i}` })) });
  }
  const file = url.match(/^https:\/\/files\.resend\.test\/([^/]+)\/(\d+)$/);
  if (file) return new Response(resend.attachments.get(decodeURIComponent(file[1]!))![Number(file[2])]!.data as BodyInit);
  return new Response("not found", { status: 404 });
});

const { POST } = await import("@/app/api/inbound/email/route");
const { activeAddress } = await import("./forwarding");
const { EINVOICE_MESSAGES } = await import("./einvoice");
const { inboxFor } = await import("./inbox");
const { MESSAGES, contributorFor } = await import("./receipts");
const { intakeReply } = await import("./reply");
const { cleanupContributors } = await import("./receipt-fixture");

const RUN = `test-inbound-${Date.now()}`;
const FIXTURES = path.join(import.meta.dirname, "../../../../packages/core/src/einvoice/fixtures");

function fresh(name: string, n: number) {
  const cufe = createHash("sha384").update(`${RUN}-${n}`).digest("hex");
  const local = new Date(Date.now() - 2 * 3_600_000 - 5 * 3_600_000).toISOString();
  return readFileSync(path.join(FIXTURES, name), "utf8")
    .replace(/0d87f960718cc4c279feec708b35a4d298d8bbc88b339cc9d6d23327b73c9c81731ecca8117f49e60ad9116aca3eecf4/g, cufe)
    .replaceAll("QZ9667377", `QZ96${RUN.slice(-8)}${n}`)
    .replaceAll("<cbc:IssueDate>2026-10-26</cbc:IssueDate><cbc:IssueTime>18:19:19-05:00</cbc:IssueTime>",
      `<cbc:IssueDate>${local.slice(0, 10)}</cbc:IssueDate><cbc:IssueTime>${local.slice(11, 19)}-05:00</cbc:IssueTime>`);
}

function webhook(emailId: string, to: string, opts: { sign?: boolean; from?: string } = {}) {
  const body = JSON.stringify({
    type: "email.received", created_at: new Date().toISOString(),
    data: { email_id: emailId, from: opts.from ?? "Comprador <shopper@example.com>", to: [to], cc: [], bcc: [], received_for: [], subject: "Fwd: Factura", attachments: [] },
  });
  const id = `msg_${randomUUID()}`;
  const now = new Date();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sign !== false) Object.assign(headers, { "svix-id": id, "svix-timestamp": String(Math.floor(now.getTime() / 1000)), "svix-signature": new Webhook(SECRET).sign(id, now, body) });
  return new Request("http://localhost/api/inbound/email", { method: "POST", headers, body });
}

async function deliver(request: Request) {
  const response = await POST(request);
  await Promise.all(pending.splice(0));
  return response;
}

describe.skipIf(!process.env["INTEGRATION"])("inbound email (dev DB)", () => {
  let address = "";
  let addressId = "";
  let contributorId = "";
  beforeEach(() => { resend.calls.length = 0; resend.sent.length = 0; });
  afterAll(async () => {
    await db().invoiceIntake.deleteMany({ where: { resendEmailId: { startsWith: RUN } } });
    await cleanupContributors(RUN);
  });

  it("refuses an unsigned request and records nothing", async () => {
    const response = await deliver(webhook(`${RUN}-unsigned`, "facturas+abcdefghij@rinde-test.resend.app", { sign: false }));
    expect(response.status).toBe(401);
    const forged = webhook(`${RUN}-forged`, "facturas+abcdefghij@rinde-test.resend.app");
    const tampered = new Request(forged.url, { method: "POST", headers: forged.headers, body: (await forged.text()).replace("Factura", "Otra") });
    expect((await deliver(tampered)).status).toBe(401);
    expect(await db().invoiceIntake.count({ where: { resendEmailId: { in: [`${RUN}-unsigned`, `${RUN}-forged`] } } })).toBe(0);
  });

  it("processes a forwarded invoice once, even when Resend sends the event again", async () => {
    const contributor = await contributorFor(`${RUN}-a`);
    contributorId = contributor.id;
    const row = await activeAddress(contributor.id);
    addressId = row.id;
    address = `facturas+${row.token}@rinde-test.resend.app`;
    resend.attachments.set(`${RUN}-1`, [{ filename: "089090060802126QZ9667377.zip", data: zipSync({ "ad1.xml": strToU8(fresh("exito.xml", 1)), "fv1.pdf": strToU8("%PDF-1.4") }) }]);

    const event = webhook(`${RUN}-1`, `Rinde <${address}>`);
    const replay = new Request(event.url, { method: "POST", headers: event.headers, body: await event.clone().text() });
    expect((await deliver(event)).status).toBe(200);
    expect(await (await deliver(replay)).json()).toMatchObject({ duplicate: true });

    const intakes = await db().invoiceIntake.findMany({ where: { resendEmailId: `${RUN}-1` } });
    expect(intakes).toHaveLength(1);
    expect(intakes[0]).toMatchObject({ status: "accepted", contributorId, addressId, store: "exito", replied: true });
    const draft = await db().receipt.findUniqueOrThrow({ where: { id: intakes[0]!.receiptId! } });
    expect(draft).toMatchObject({ source: "einvoice", dianConfirmed: true, contributorId });

    // One reply, with the review link and no prices.
    expect(resend.sent).toHaveLength(1);
    expect(resend.sent[0]!.to).toEqual(["Comprador <shopper@example.com>"]);
    expect(resend.sent[0]!.text).toContain(`https://rinde.test/receipt?draft=${draft.id}`);
    expect(JSON.stringify(resend.sent[0])).not.toMatch(/8\.?600|16\.?100|GALLETAS/i);
  });

  it("records a rejection and lists it on the receipt screen", async () => {
    resend.attachments.set(`${RUN}-2`, [{ filename: "carulla.zip", data: zipSync({ "ad2.xml": strToU8(fresh("carulla.xml", 2)) }) }]);
    await deliver(webhook(`${RUN}-2`, address));
    const intake = await db().invoiceIntake.findUniqueOrThrow({ where: { resendEmailId: `${RUN}-2` } });
    expect(intake).toMatchObject({ status: "rejected", message: MESSAGES.store });
    expect(resend.sent[0]!.text).toContain(MESSAGES.store);
    const inbox = await inboxFor(contributorId);
    expect(inbox.recent[0]).toMatchObject({ status: "rejected", message: MESSAGES.store });
    expect(inbox.drafts).toHaveLength(1);
  });

  it("says when the email has no invoice", async () => {
    resend.attachments.set(`${RUN}-3`, [{ filename: "foto.jpg", data: strToU8("jpg") }]);
    await deliver(webhook(`${RUN}-3`, address));
    expect(await db().invoiceIntake.findUniqueOrThrow({ where: { resendEmailId: `${RUN}-3` } })).toMatchObject({ status: "rejected", message: EINVOICE_MESSAGES.missing });
  });

  it("drops an email to an unknown address without downloading anything or replying", async () => {
    resend.attachments.set(`${RUN}-4`, [{ filename: "x.zip", data: zipSync({ "ad.xml": strToU8("<a/>") }) }]);
    await deliver(webhook(`${RUN}-4`, "facturas+zzzzzzzzzz@rinde-test.resend.app"));
    expect(await db().invoiceIntake.findUniqueOrThrow({ where: { resendEmailId: `${RUN}-4` } })).toMatchObject({ status: "dropped", contributorId: null });
    expect(resend.calls).toEqual([]);
  });

  it("drops the 21st email of the day with a single limit message", async () => {
    await db().forwardingAddress.update({ where: { id: addressId }, data: { emailsToday: 19, countedOn: new Date() } });
    resend.attachments.set(`${RUN}-5`, [{ filename: "carulla.zip", data: zipSync({ "ad5.xml": strToU8(fresh("carulla.xml", 5)) }) }]);
    await deliver(webhook(`${RUN}-5`, address)); // 20th: processed
    resend.calls.length = 0; resend.sent.length = 0;
    await deliver(webhook(`${RUN}-6`, address)); // 21st
    await deliver(webhook(`${RUN}-7`, address)); // 22nd
    const [twentyFirst, twentySecond] = await Promise.all([`${RUN}-6`, `${RUN}-7`].map((id) => db().invoiceIntake.findUniqueOrThrow({ where: { resendEmailId: id } })));
    expect(twentyFirst).toMatchObject({ status: "rejected", message: EINVOICE_MESSAGES.flood });
    expect(twentySecond).toMatchObject({ status: "dropped" });
    expect(resend.calls).toEqual([]);
    const inbox = await inboxFor(contributorId);
    expect(inbox.recent.filter((r) => r.message === EINVOICE_MESSAGES.flood)).toHaveLength(1);
  });
});

describe("intake reply", () => {
  it("links an accepted invoice to its review and never carries prices", () => {
    vi.stubEnv("APP_URL", "https://rinde.example/");
    const reply = intakeReply({ status: "accepted", message: null, receiptId: "ck123" });
    expect(reply.text).toContain("https://rinde.example/receipt?draft=ck123");
    expect(reply.html).toContain("https://rinde.example/receipt?draft=ck123");
    expect(`${reply.subject}${reply.text}${reply.html}`).not.toMatch(/\$|\d{1,3}\.\d{3}/);
  });

  it("carries the rejection message", () => {
    const reply = intakeReply({ status: "rejected", message: "Por ahora leemos facturas de D1, Jumbo y Éxito.", receiptId: null });
    expect(reply.text.startsWith("Por ahora leemos facturas de D1, Jumbo y Éxito.")).toBe(true);
    expect(reply.subject).toBe("No pudimos usar tu factura en Rinde");
  });
});
