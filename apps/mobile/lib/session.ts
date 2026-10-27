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
