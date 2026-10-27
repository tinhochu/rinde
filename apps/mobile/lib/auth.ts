import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAuthClient } from "better-auth/react";
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
  plugins: [expoClient({ scheme: "rinde", storagePrefix: "rinde", storage: SecureStore })],
});

export type AuthMethods = { email: boolean; google: boolean };

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
  const [methods, setMethods] = useState<AuthMethods>({ email: true, google: false });

  useEffect(() => {
    fetch(`${apiBase()}/api/account`).then(r => r.json()).then(d => d.methods && setMethods(d.methods)).catch(() => undefined);
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

  return { user, loading: isPending, methods, signOut };
}

/** Better Auth's error codes, in the app's voice. */
export function authErrorMessage(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ?? "";
  if (code.includes("ALREADY_EXISTS")) return "Ya hay una cuenta con ese correo. Entra con tu contraseña.";
  if (code.includes("INVALID_EMAIL_OR_PASSWORD") || code.includes("CREDENTIAL")) return "El correo o la contraseña no coinciden.";
  if (code.includes("PASSWORD_TOO_SHORT")) return "La contraseña necesita al menos 8 caracteres.";
  if (code.includes("INVALID_EMAIL")) return "Revisa el correo: parece incompleto.";
  return "No pudimos completar el ingreso. Revisa tu conexión e inténtalo de nuevo.";
}
