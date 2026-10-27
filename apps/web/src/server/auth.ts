import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db } from "@rinde/db";
import { emailDelivery, sendCode } from "@/server/email";
import { allowedOrigins } from "@/server/origins";

const CODE_MINUTES = 10;

const google = process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
  ? { clientId: process.env["GOOGLE_CLIENT_ID"], clientSecret: process.env["GOOGLE_CLIENT_SECRET"] }
  : undefined;

/**
 * Accounts are optional: everything works with the anonymous device session, and signing in only
 * carries points and receipts across devices. The phone app keeps its session in the keychain
 * (Expo plugin); the web app uses ordinary cookies.
 */
export const auth = betterAuth({
  database: prismaAdapter(db(), { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: google ? { google } : {},
  user: {
    deleteUser: {
      enabled: true,
      // Receipts and points stay with the device's anonymous contributor; the link and public name go.
      beforeDelete: async (user) => {
        await db().contributor.updateMany({ where: { accountId: user.id }, data: { accountId: null, displayName: null } });
      },
    },
  },
  trustedOrigins: [
    ...allowedOrigins,
    "rinde://",
    ...(process.env.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
  ],
  plugins: [
    expo(),
    // One-time codes by email: sign in or create an account without a password, and reset a forgotten one.
    // Unknown addresses asking for a reset get the same answer and no email, so accounts can't be probed.
    ...(emailDelivery ? [emailOTP({
      otpLength: 6,
      expiresIn: CODE_MINUTES * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOTP: ({ email, otp, type }) => sendCode(email, otp, type, CODE_MINUTES),
    })] : []),
  ],
});

/** Which sign-in methods the server has configured, so the app shows only working buttons. */
export const authMethods = { email: true, code: emailDelivery !== null, google: Boolean(google) };

export async function currentUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}
