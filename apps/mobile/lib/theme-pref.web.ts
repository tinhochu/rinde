export type ThemePref = "system" | "light" | "dark";
const KEY = "rinde-theme";

/** Read synchronously at launch: styles are built from it before any screen renders. */
export function readThemePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice and reloads so every screen rebuilds its colors. */
export function saveThemePref(pref: ThemePref): boolean {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
