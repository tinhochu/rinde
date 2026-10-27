import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@rinde/db";

/**
 * Personal forwarding addresses (einvoice-intake spec): facturas+<token>@INBOUND_EMAIL_DOMAIN.
 * The token is random, never derived from the session, email or name.
 */

/** Receiving email is on only with both the webhook secret and the inbound domain. */
export function inboundConfig(): { secret: string; domain: string } | null {
  const secret = process.env["RESEND_WEBHOOK_SECRET"];
  const domain = process.env["INBOUND_EMAIL_DOMAIN"];
  return secret && domain ? { secret, domain: domain.toLowerCase().replace(/^@/, "") } : null;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function newToken(): string {
  return [...randomBytes(10)].map((b) => ALPHABET[b & 31]).join("");
}

export const addressText = (token: string, domain: string) => `facturas+${token}@${domain}`;

/** The contributor's active address, created on first use. */
export async function activeAddress(contributorId: string) {
  const prisma = db();
  const current = await prisma.forwardingAddress.findFirst({ where: { contributorId, active: true }, orderBy: { createdAt: "desc" } });
  return current ?? prisma.forwardingAddress.create({ data: { contributorId, token: newToken() } });
}

/** "Cambiar dirección": the old address stops accepting invoices and a new one is issued. */
export async function rotateAddress(contributorId: string) {
  return db().$transaction(async (tx) => {
    await tx.forwardingAddress.updateMany({ where: { contributorId, active: true }, data: { active: false } });
    return tx.forwardingAddress.create({ data: { contributorId, token: newToken() } });
  });
}

/** The token in a recipient: `facturas+<token>@…` or, on a managed domain, `<token>@…`. The domain isn't checked. */
export function tokenOf(recipient: string): string | null {
  const email = recipient.match(/<([^>]+)>/)?.[1] ?? recipient;
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const token = local.startsWith("facturas+") ? local.slice("facturas+".length) : local;
  return /^[a-z2-7]{10}$/.test(token) ? token : null;
}

/** The active address among an email's recipients, with its contributor; null when none is ours. */
export async function resolveRecipient(recipients: string[]) {
  const tokens = recipients.map(tokenOf).filter((t): t is string => !!t);
  if (tokens.length === 0) return null;
  return db().forwardingAddress.findFirst({ where: { token: { in: tokens }, active: true } });
}
