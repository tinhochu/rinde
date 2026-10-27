import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { expo } from "@better-auth/expo";
import { db } from "@rinde/db";
import { allowedOrigins } from "@/server/origins";

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
  trustedOrigins: [
    ...allowedOrigins,
    "rinde://",
    ...(process.env.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
  ],
  plugins: [expo()],
});

/** Which sign-in methods the server has configured, so the app shows only working buttons. */
export const authMethods = { email: true, google: Boolean(google) };

export async function currentUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}
