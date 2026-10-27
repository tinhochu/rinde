import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@rinde/db";
import { mergeContributors } from "./rewards";

/**
 * Ties this device's anonymous history to the signed-in account and returns the session id the
 * device should use from now on. The first device to sign in becomes the account's contributor;
 * later devices fold their receipts, points and badges into it and adopt its session id, so every
 * route that reads X-Rinde-Session keeps working unchanged.
 */
export async function linkDevice(userId: string, deviceSession: string): Promise<{ sessionId: string; merged: boolean }> {
  return db().$transaction(async (tx) => {
    const mine = await tx.contributor.findUnique({ where: { accountId: userId } });
    const device = await tx.contributor.findUnique({ where: { sessionId: deviceSession } });
    // A device still holding another account's session never hands that history over.
    const takeable = device && device.accountId === null ? device : null;

    if (!mine) {
      if (takeable) {
        await tx.contributor.update({ where: { id: takeable.id }, data: { accountId: userId } });
        return { sessionId: takeable.sessionId, merged: false };
      }
      const sessionId = device ? randomUUID() : deviceSession;
      await tx.contributor.create({ data: { sessionId, accountId: userId } });
      return { sessionId, merged: false };
    }
    if (takeable && takeable.id !== mine.id) {
      await mergeContributors(tx, takeable.id, mine.id);
      return { sessionId: mine.sessionId, merged: true };
    }
    return { sessionId: mine.sessionId, merged: false };
  });
}
