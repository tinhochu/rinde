import { DevSettings } from "react-native";
import Storage from "expo-sqlite/kv-store";

export type ThemePref = "system" | "light" | "dark";
const KEY = "rinde-theme";

/** Read synchronously at launch: styles are built from it before any screen renders. */
export function readThemePref(): ThemePref {
  try {
    const v = Storage.getItemSync(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice and reloads so every screen rebuilds its colors. Returns false if it applies on next launch. */
export function saveThemePref(pref: ThemePref): boolean {
  try {
    Storage.setItemSync(KEY, pref);
  } catch {
    return false;
  }
  if (__DEV__) {
    DevSettings.reload();
    return true;
  }
  return false;
}
