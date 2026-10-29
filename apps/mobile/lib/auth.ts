import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { apiBase } from "./api";
import { resetSession, sessionId, setSessionId } from "./session";
import { toast } from "./toast";

/**
 * Better Auth, served by our own API. On a phone the session lives in the keychain and travels as a
 * header; on the web it is an ordinary cookie, so requests must include credentials.
 */
export const authClient = createAuthClient({
  baseURL: apiBase(),
  fetchOptions: Platform.OS === "web" ? { credentials: "include" } : undefined,
  plugins: [expoClient({ scheme: "rinde", storagePrefix: "rinde", storage: SecureStore }), emailOTPClient()],
});

/**
 * email: password sign-in; code: one-time codes by email (only when the server can send them); google: OAuth;
 * captcha: whether sign-in forms must solve the server's proof of work (lib/captcha.ts).
 */
export type AuthMethods = { email: boolean; code: boolean; google: boolean; captcha: boolean };

const LINKED = "rinde-linked-user";

/** Headers that prove who is signed in, for our own /api routes. */
async function authInit(): Promise<RequestInit> {
  if (Platform.OS === "web") return { credentials: "include" };
  const cookie = await authClient.getCookie();
  return { credentials: "omit", headers: cookie ? { Cookie: cookie } : {} };
}

/** Carries this device's receipts and points into the account and switches to the account's session id. */
async function linkThisDevice(): Promise<{ merged: boolean }> {
  const init = await authInit();
  const response = await fetch(`${apiBase()}/api/account/link`, {
    ...init,
    method: "POST",
    headers: { ...(init.headers as Record<string, string>), "X-Rinde-Session": await sessionId() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No pudimos conectar tu cuenta.");
  await setSessionId(data.sessionId);
  return { merged: data.merged };
}

/** The signed-in person (or null), the sign-in methods the server offers, and sign-out. */
export function useAccount() {
  const { data, isPending } = authClient.useSession();
  const user = data?.user ?? null;
  const [methods, setMethods] = useState<AuthMethods>({ email: true, code: false, google: false, captcha: false });
  // Until the server answers, the screen can't know whether codes or Google are available.
  const [methodsReady, setMethodsReady] = useState(false);

  useEffect(() => {
    fetch(`${apiBase()}/api/account`).then(r => r.json()).then(d => d.methods && setMethods(d.methods)).catch(() => undefined)
      .finally(() => setMethodsReady(true));
  }, []);

  // Whichever way the person signed in (form, Google redirect, another tab), link this device once.
  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      if ((await AsyncStorage.getItem(LINKED).catch(() => null)) === user.id) return;
      const { merged } = await linkThisDevice();
      await AsyncStorage.setItem(LINKED, user.id).catch(() => undefined);
      if (live && merged) toast.success("Juntamos los puntos de este dispositivo con tu cuenta.");
    })().catch(e => live && toast.error(e instanceof Error ? e.message : "No pudimos conectar tu cuenta."));
    return () => { live = false; };
  }, [user?.id]);

  async function signOut() {
    await authClient.signOut();
    await AsyncStorage.removeItem(LINKED).catch(() => undefined);
    await resetSession();
  }

  /** Changes the private account name (not the alias on the ranking). */
  async function rename(name: string) {
    const { error } = await authClient.updateUser({ name });
    if (error) throw new Error("No pudimos cambiar tu nombre. Revisa tu conexión e inténtalo de nuevo.");
  }

  /**
   * Deletes the account. Better Auth asks for the password, or for a recent sign-in when there is
   * none (Google). This device then starts over as an anonymous session.
   */
  async function deleteAccount(password?: string) {
    const { error } = await authClient.deleteUser(password ? { password } : {});
    if (error) {
      const code = error.code ?? "";
      if (code.includes("PASSWORD")) throw new Error("La contraseña no coincide.");
      if (code.includes("SESSION_EXPIRED") || code.includes("FRESH")) throw new Error("Por seguridad, cierra sesión, vuelve a entrar y repite este paso.");
      throw new Error("No pudimos eliminar tu cuenta. Revisa tu conexión e inténtalo de nuevo.");
    }
    await AsyncStorage.removeItem(LINKED).catch(() => undefined);
    await resetSession();
  }

  /** Whether this account has a password (it may have signed up with a code or Google). */
  async function hasPassword() {
    const { data } = await authClient.listAccounts();
    return !!data?.some(a => a.providerId === "credential");
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (error) throw new Error(authErrorMessage(error));
  }

  return { user, loading: isPending, methods, methodsReady, signOut, rename, deleteAccount, hasPassword, changePassword };
}

/** Better Auth's error codes, in the app's voice. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined) {
  const code = error?.code ?? "";
  if (code.includes("ALREADY_EXISTS")) return "Ya hay una cuenta con ese correo. Entra con tu contraseña.";
  if (code.includes("INVALID_EMAIL_OR_PASSWORD") || code.includes("CREDENTIAL")) return "El correo o la contraseña no coinciden.";
  if (code === "PASSWORD_COMPROMISED") return "Esa contraseña aparece en filtraciones conocidas. Elige otra.";
  if (code === "CAPTCHA_REQUIRED" || code === "CAPTCHA_INVALID") return "No pudimos comprobar que no eres un robot. Inténtalo de nuevo.";
  if (code.includes("PASSWORD_TOO_SHORT")) return "La contraseña necesita al menos 8 caracteres.";
  if (code.includes("INVALID_EMAIL")) return "Revisa el correo: parece incompleto.";
  if (code === "INVALID_OTP") return "Ese código no es correcto. Revísalo o pide uno nuevo.";
  if (code === "OTP_EXPIRED") return "El código venció. Pide uno nuevo.";
  if (code === "TOO_MANY_ATTEMPTS") return "Demasiados intentos con ese código. Pide uno nuevo.";
  if (code.includes("INVALID_PASSWORD")) return "La contraseña actual no coincide.";
  if (code.includes("PASSWORD_TOO_LONG")) return "La contraseña es demasiado larga.";
  if (error?.status === 429 || code.includes("TOO_MANY_REQUESTS")) return "Pediste muchos códigos seguidos. Espera un minuto e inténtalo de nuevo.";
  return "No pudimos completar el ingreso. Revisa tu conexión e inténtalo de nuevo.";
}
