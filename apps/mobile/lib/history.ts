import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rinde-picks";
const MAX = 30;
type Pick = { id: string; n: number; at: number };

async function read(): Promise<Pick[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Pick[]) : [];
    return Array.isArray(list) ? list.filter(p => typeof p?.id === "string" && typeof p.n === "number") : [];
  } catch {
    return [];
  }
}

/** Remembers a product the person opened or added from search; only real store listings, on this device only. */
export async function recordPick(id: string) {
  const list = await read();
  const found = list.find(p => p.id === id);
  const next = found ? list.map(p => (p.id === id ? { ...p, n: p.n + 1, at: Date.now() } : p)) : [...list, { id, n: 1, at: Date.now() }];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next.sort((a, b) => b.at - a.at).slice(0, MAX)));
  } catch {
    // Sin historial guardado, la sección muestra ideas generales.
  }
}

/** Most picked first, then most recent. */
export async function topPicks(limit = 12): Promise<string[]> {
  return (await read()).sort((a, b) => b.n - a.n || b.at - a.at).slice(0, limit).map(p => p.id);
}
