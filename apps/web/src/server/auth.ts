import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, haveIBeenPwned } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db } from "@rinde/db";
import { spendSolution } from "@/server/captcha";
import { emailDelivery, sendCode } from "@/server/email";
import { allowedOrigins } from "@/server/origins";

const CODE_MINUTES = 10;

const google = process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
  ? { clientId: process.env["GOOGLE_CLIENT_ID"], clientSecret: process.env["GOOGLE_CLIENT_SECRET"] }
  : undefined;

// Every form that sends a code or tries a password solves a self-hosted proof of work first (server/captcha.ts).
const CAPTCHA_ENDPOINTS = ["/sign-up/email", "/sign-in/email", "/email-otp/send-verification-otp", "/email-otp/request-password-reset"];

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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!CAPTCHA_ENDPOINTS.includes(ctx.path)) return;
      const rejection = await spendSolution(ctx.headers?.get("x-captcha-response"));
      if (rejection) {
        throw new APIError("BAD_REQUEST", {
          code: rejection === "MISSING" ? "CAPTCHA_REQUIRED" : "CAPTCHA_INVALID",
          message: "No pudimos comprobar que no eres un robot. Inténtalo de nuevo.",
        });
      }
    }),
  },
  trustedOrigins: [
    ...allowedOrigins,
    "rinde://",
    ...(process.env.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
  ],
  plugins: [
    expo(),
    // Refuses passwords already exposed in known breaches; only the first 5 characters of the password's SHA-1 leave the server.
    haveIBeenPwned({ customPasswordCompromisedMessage: "Esa contraseña aparece en filtraciones conocidas. Elige otra." }),
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
export const authMethods = { email: true, code: emailDelivery !== null, google: Boolean(google), captcha: true };

export async function currentUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}
