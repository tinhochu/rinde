import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const KEY = "rinde-session";
let pending: Promise<string> | null = null;

/**
 * This install's anonymous id, kept across launches: lists, receipts and points belong to it
 * until the person signs in. Falls back to a per-launch id if storage is unavailable.
 */
export function sessionId(): Promise<string> {
  pending ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved) return saved;
      const fresh = Crypto.randomUUID();
      await AsyncStorage.setItem(KEY, fresh);
      return fresh;
    } catch {
      return Crypto.randomUUID();
    }
  })();
  return pending;
}

/** Switches this install to another id: the account's, after signing in. */
export async function setSessionId(id: string) {
  pending = Promise.resolve(id);
  await AsyncStorage.setItem(KEY, id).catch(() => undefined);
}

/** After signing out: a fresh anonymous id, so the account's receipts and points stay with the account. */
export async function resetSession() {
  await setSessionId(Crypto.randomUUID());
}
