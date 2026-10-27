import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Store } from "./market";
import { cartSchema, draftSchema, favoritesSchema, type CartLine, type Frequency, type SavedDraft, type ShopProduct } from "./shop";

const KEYS = { cart: "rinde-cart", favorites: "rinde-favorites", prefs: "rinde-preferences", draft: "rinde-draft" } as const;

type Prefs = { budget: number; people: number; zone: string; tripCost?: number; hasBudget?: boolean; frequency?: Frequency; stores?: Store[] };

async function read(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** False when the device refused the write; the flow keeps working either way. */
async function write(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function loadSaved(): Promise<{ cart: CartLine[]; favorites: ShopProduct[]; prefs: Prefs | null; draft: SavedDraft | null }> {
  const [rawCart, rawFav, rawPrefs, rawDraft] = await Promise.all([read(KEYS.cart), read(KEYS.favorites), read(KEYS.prefs), read(KEYS.draft)]);
  const draft = draftSchema.safeParse(rawDraft);
  const prefs = draftSchema.omit({ items: true }).safeParse(rawPrefs);
  // Los esquemas eliminan las ofertas: nunca restauramos un precio guardado como vigente.
  const cart = cartSchema.safeParse(rawCart);
  const favorites = favoritesSchema.safeParse(rawFav);
  return {
    cart: cart.success ? cart.data : [],
    favorites: favorites.success ? favorites.data : [],
    prefs: prefs.success ? prefs.data : draft.success ? draft.data : null,
    draft: draft.success ? draft.data : null,
  };
}

export function saveCart(cart: CartLine[]) {
  const parsed = cartSchema.safeParse(cart);
  if (parsed.success) void write(KEYS.cart, parsed.data);
}

export function saveFavorites(favorites: ShopProduct[]) {
  const parsed = favoritesSchema.safeParse(favorites);
  if (parsed.success) void write(KEYS.favorites, parsed.data);
}

export function savePrefs(prefs: Prefs): Promise<boolean> {
  return write(KEYS.prefs, prefs);
}

export function saveDraft(draft: SavedDraft) {
  void write(KEYS.draft, draft);
}

export function deleteDraft() {
  AsyncStorage.removeItem(KEYS.draft).catch(() => undefined);
}
