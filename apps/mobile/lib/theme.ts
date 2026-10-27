import { Appearance, Platform } from "react-native";
import { readThemePref, type ThemePref } from "./theme-pref";

// Rinde palette ported from the PWA (shadcn new-york tokens, HSL -> hex).
// Rule: every color in the app comes from here. No Tailwind on native.
const light = {
  background: "#FCFAF8",
  foreground: "#22352C",
  card: "#FFFFFF",
  primary: "#21734D",
  primaryForeground: "#FFFFFF",
  secondary: "#ECF3EE",
  secondaryForeground: "#2A5A43",
  secondaryBorder: "#D6E4DA",
  muted: "#F3F1ED",
  mutedForeground: "#69776F",
  accent: "#DD6D27",
  accentForeground: "#FFFFFF",
  destructive: "#BC2929",
  border: "#E5E2DC",
  input: "#DCD6C6",
  /** Controls floating over photos (favorite button, chips) */
  floating: "rgba(255,255,255,0.95)",
  floatingSoft: "rgba(255,255,255,0.75)",
  // Web hex literals used across the PWA, kept identical:
  cream: "#FFFDF5",
  receiptBg: "#FFF9EF",
  receiptInk: "#263D2F",
  receiptMuted: "#626A61",
  warnBg: "#FFF8F0",
  warnSurface: "#FFF4E8",
  warnInk: "#88431F",
  warnInkSoft: "#995322",
  warnText: "#956026",
  staleInk: "#A04A26",
  heroGreen: "#E6F2DE",
  heroInk: "#173E25",
  heroSub: "#486444",
  /** The results panel: Rinde's deep forest green, the one dark surface in the planner. */
  forest: "#173E25",
  forestInk: "#FFFFFF",
  forestSub: "#BFD8C5",
  forestLine: "rgba(255,255,255,0.16)",
  forestGood: "#B9F0C9",
  forestWarn: "#FFC59E",
  forestMeter: "#7CD69B",
  photoBg: "#FFF7E9",
  photoFrame: "#F0E4CC",
  photoInk: "#A36732",
  photoIcon: "#B36B32",
  cartFooter: "#FAFCF8",
  errorBg: "#FAFBF7",
  searchBg: "#F3F4F1",
  imageBg: "#F5F7F1",
  formBg: "#FAFCF9",
  savingsInk: "#B85A2F",
  savingsBg: "#FBEDE3",
};

// Same roles at night: warm green-black surfaces, a brighter green that reads as text and still carries white.
const dark: typeof light = {
  background: "#111613",
  foreground: "#E6EDE8",
  card: "#1A211D",
  primary: "#2F9463",
  primaryForeground: "#FFFFFF",
  secondary: "#1D2F25",
  secondaryForeground: "#A8D4B9",
  secondaryBorder: "#2C4636",
  muted: "#222924",
  mutedForeground: "#9AA79F",
  accent: "#EE8443",
  accentForeground: "#FFFFFF",
  destructive: "#E26060",
  border: "#2C3530",
  input: "#3A443E",
  floating: "rgba(26,33,29,0.92)",
  floatingSoft: "rgba(26,33,29,0.75)",
  cream: "#1C1F18",
  receiptBg: "#1F1F18",
  receiptInk: "#E6EBE3",
  receiptMuted: "#A6ADA3",
  warnBg: "#2A2117",
  warnSurface: "#30251A",
  warnInk: "#F0B48B",
  warnInkSoft: "#E8A878",
  warnText: "#E2AF78",
  staleInk: "#EF9A72",
  heroGreen: "#1B2B20",
  heroInk: "#D5EAD8",
  heroSub: "#A6C0A2",
  forest: "#163122",
  forestInk: "#EAF4EC",
  forestSub: "#9DBBA5",
  forestLine: "rgba(255,255,255,0.12)",
  forestGood: "#A9E3BA",
  forestWarn: "#F7B98F",
  forestMeter: "#5FBF83",
  photoBg: "#272016",
  photoFrame: "#46392A",
  photoInk: "#E0A66C",
  photoIcon: "#E5A262",
  cartFooter: "#151B17",
  errorBg: "#161C18",
  searchBg: "#202824",
  // Product packshots are shot on white; a light well keeps them looking like products, not cutouts.
  imageBg: "#EEF0EA",
  formBg: "#171E1A",
  savingsInk: "#F0996A",
  savingsBg: "#33241A",
};

/** Category card tints, light and dark (apps/mobile/lib/shop.ts CATEGORIES). */
const lightTints = { all: "#EDF5E7", produce: "#FFF1DB", dairy: "#EAF3FA", pantry: "#F7EFE4", meat: "#FBECE6", bakery: "#FBF0DD", drinks: "#F2ECF8", home: "#EAF3ED" };
const darkTints: typeof lightTints = { all: "#1E2B1E", produce: "#2D2516", dairy: "#18252F", pantry: "#2A2219", meat: "#2E1F1B", bakery: "#2C2416", drinks: "#251E2E", home: "#1A2A20" };

/**
 * Styles are built once when each screen loads, so the scheme is fixed at launch: the person's choice in
 * Perfil, or the system's. Changing either reloads the app (on a phone build, the system change applies
 * the next time it opens).
 */
export const themePref: ThemePref = readThemePref();
export const scheme: "light" | "dark" =
  themePref !== "system" ? themePref : Appearance.getColorScheme() === "dark" ? "dark" : "light";
export const colors = scheme === "dark" ? dark : light;
export const tints = scheme === "dark" ? darkTints : lightTints;

if (Platform.OS === "web" && typeof window !== "undefined" && themePref === "system") {
  Appearance.addChangeListener(({ colorScheme }) => {
    if ((colorScheme === "dark" ? "dark" : "light") !== scheme) window.location.reload();
  });
}

export const stores = {
  exito: { bg: "#FFE627", fg: "#282921", label: "éxito" },
  jumbo: { bg: "#168440", fg: "#FFFFFF", label: "Jumbo", italic: true },
  d1: { bg: "#E43435", fg: "#FFFFFF", label: "D1" },
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const fontSize = {
  tiny: 9,
  small: 10,
  caption: 11,
  body: 13,
  subhead: 14,
  title: 17,
  headline: 22,
  hero: 34,
} as const;
