// Rinde palette ported from the PWA (shadcn new-york tokens, HSL -> hex).
// Rule: every color in the app comes from here. No Tailwind on native.
export const colors = {
  background: "#FCFAF8",
  foreground: "#22352C",
  card: "#FFFFFF",
  primary: "#21734D",
  primaryForeground: "#FFFFFF",
  secondary: "#ECF3EE",
  secondaryForeground: "#2A5A43",
  muted: "#F3F1ED",
  mutedForeground: "#69776F",
  accent: "#DD6D27",
  accentForeground: "#FFFFFF",
  destructive: "#BC2929",
  border: "#E5E2DC",
  input: "#DCD6C6",
  // Web hex literals used across the PWA, kept identical:
  cream: "#FFFDF5",
  receiptBg: "#FFF9EF",
  receiptInk: "#263D2F",
  receiptMuted: "#626A61",
  warnBg: "#FFF8F0",
  warnInk: "#88431F",
  warnInkSoft: "#995322",
  warnText: "#956026",
  staleInk: "#A04A26",
  heroGreen: "#E6F2DE",
  heroInk: "#173E25",
  heroSub: "#486444",
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
} as const;

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
