import { afterAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";

const { linkDevice } = await import("./account");
const { activeAddress, resolveRecipient } = await import("./forwarding");
const { cleanupContributors } = await import("./receipt-fixture");

const RUN = `test-account-${Date.now()}`;
const user = (n: string) => `${RUN}-user-${n}`;
const device = (n: string) => `${RUN}-device-${n}`;

async function deviceWithPoints(session: string, points: number) {
  const c = await db().contributor.create({ data: { sessionId: session } });
  await db().rewardEvent.create({ data: { contributorId: c.id, kind: "line", points, label: "Prueba" } });
  return c;
}

const pointsOf = async (sessionId: string) =>
  (await db().rewardEvent.aggregate({ where: { contributor: { sessionId } }, _sum: { points: true } }))._sum.points ?? 0;

describe.skipIf(!process.env["INTEGRATION"])("linkDevice (dev DB)", () => {
  afterAll(async () => {
    // Sessions handed out by linkDevice may not carry the test prefix; find them by account too.
    const linked = await db().contributor.findMany({ where: { accountId: { startsWith: RUN } }, select: { id: true, sessionId: true } });
    for (const c of linked) if (!c.sessionId.startsWith(RUN)) await db().contributor.update({ where: { id: c.id }, data: { sessionId: `${RUN}-moved-${c.id}` } });
    await cleanupContributors(RUN);
  });

  it("makes the first device the account's contributor, keeping its points and session", async () => {
    const phone = await deviceWithPoints(device("phone"), 40);
    const linked = await linkDevice(user("a"), device("phone"));
    expect(linked).toEqual({ sessionId: device("phone"), merged: false });
    expect(await db().contributor.findUniqueOrThrow({ where: { id: phone.id } })).toMatchObject({ accountId: user("a") });
  });

  it("folds a second device's points into the account and hands it the account's session", async () => {
    await deviceWithPoints(device("laptop"), 25);
    const linked = await linkDevice(user("a"), device("laptop"));
    expect(linked).toEqual({ sessionId: device("phone"), merged: true });
    expect(await pointsOf(device("phone"))).toBe(65);
    expect(await db().contributor.findUnique({ where: { sessionId: device("laptop") } })).toBeNull();
  });

  it("delivers invoices sent to either device's forwarding address to the merged contributor", async () => {
    const tablet = await db().contributor.create({ data: { sessionId: device("tablet") } });
    const account = await db().contributor.findUniqueOrThrow({ where: { sessionId: device("phone") } });
    const accountAddress = await activeAddress(account.id);
    const tabletAddress = await activeAddress(tablet.id);
    await db().invoiceIntake.create({ data: { contributorId: tablet.id, addressId: tabletAddress.id, via: "email", status: "rejected", message: "x" } });
    await linkDevice(user("a"), device("tablet"));
    for (const address of [accountAddress, tabletAddress]) {
      const found = await resolveRecipient([`Rinde <facturas+${address.token}@example.resend.app>`]);
      expect(found?.contributorId).toBe(account.id);
    }
    expect(await db().invoiceIntake.count({ where: { contributorId: account.id } })).toBe(1);
  });

  it("is a no-op when the device already uses the account's session", async () => {
    expect(await linkDevice(user("a"), device("phone"))).toEqual({ sessionId: device("phone"), merged: false });
    expect(await pointsOf(device("phone"))).toBe(65);
  });

  it("creates the contributor for a device that has no history yet", async () => {
    expect(await linkDevice(user("b"), device("new"))).toEqual({ sessionId: device("new"), merged: false });
    expect(await db().contributor.findUniqueOrThrow({ where: { sessionId: device("new") } })).toMatchObject({ accountId: user("b") });
  });

  it("never gives one account's history to another account signing in on the same device", async () => {
    const linked = await linkDevice(user("c"), device("phone"));
    expect(linked.sessionId).not.toBe(device("phone"));
    expect(await pointsOf(device("phone"))).toBe(65);
    expect(await db().contributor.findUniqueOrThrow({ where: { sessionId: device("phone") } })).toMatchObject({ accountId: user("a") });
  });
});
