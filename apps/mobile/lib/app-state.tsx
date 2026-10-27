import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { usePathname, useRouter } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import type { ListItem, Store } from "./market";
import { createPlan, decideTradeoff, itemStatuses, NO_BUDGET, type ItemStatus, type PlanRequest, type PlanResult, type VerifyProgress } from "./planner";
import { deleteDraft, loadSaved, saveCart, saveDraft, saveFavorites, savePrefs } from "./storage";
import { isFresh, toListItems, type CartLine, type Frequency, type SavedDraft, type ShopProduct } from "./shop";
import { recordPick } from "./history";
import { rememberProduct } from "./product-cache";
import { searchHref } from "./search";
import { toast } from "./toast";

export type AppModal = "area" | "saved" | "help" | "privacy" | null;

/** The planner's phases: build the list, set the budget, wait for prices, see where it goes further. */
export const PHASE = { list: 0, budget: 1, checking: 2, results: 3 } as const;

type Prefs = Partial<{ budget: number; hasBudget: boolean; frequency: Frequency; people: number; tripCost: number; stores: Store[] }>;

type AppStateValue = {
  step: number; budget: number; hasBudget: boolean; frequency?: Frequency; people: number; knowsPeople: boolean;
  zone: string; area: string; tripCost: number;
  /** Stores the person wants in comparisons by default; empty means all */
  stores: Store[];
  items: ListItem[]; result?: PlanResult; itemStatus: Record<string, ItemStatus>;
  progress: VerifyProgress[]; refreshing: boolean; deciding: string | null; fromCart: boolean;
  cart: CartLine[]; cartCount: number; favorites: ShopProduct[];
  product: ShopProduct | null; modal: AppModal; saved?: SavedDraft;
  hydrated: boolean; offline: boolean;
  go: (next: number) => void;
  openPlanner: (useCart?: boolean) => void;
  explore: () => void;
  openProduct: (next: ShopProduct) => void;
  closeProduct: () => void;
  openModal: (next: AppModal) => void;
  closeModal: () => void;
  setZone: (next: string) => void;
  setPrefs: (next: Prefs) => void;
  setItems: (list: ListItem[]) => void;
  compare: (opts?: { hasBudget?: boolean }) => void;
  refresh: () => void;
  decide: (key: string, decision: "accept" | "reject") => void;
  resume: () => void;
  deleteSaved: () => void;
  addProduct: (next: ShopProduct) => void;
  removeProduct: (id: string) => void;
  deleteLine: (id: string) => void;
  clearCart: () => void;
  favoriteProduct: (next: ShopProduct) => void;
  searchProduct: () => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState fuera del proveedor.");
  return value;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(200000);
  const [hasBudget, setHasBudget] = useState(true);
  const [frequency, setFrequency] = useState<Frequency>();
  const [people, setPeople] = useState(4);
  // Household size is only shown as chosen once the person has chosen it (or saved it before).
  const [knowsPeople, setKnowsPeople] = useState(false);
  // COP an extra store stop is worth to the user; the planner only adds a stop when it saves more.
  const [tripCost, setTripCost] = useState(10000);
  const [stores, setStores] = useState<Store[]>([]);
  const [zone, setZoneState] = useState("");
  const [items, setItemsState] = useState<ListItem[]>([]);
  const [result, setResult] = useState<PlanResult>();
  // What the last real plan found for each list item, kept while the list is edited afterwards.
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [progress, setProgress] = useState<VerifyProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [fromCart, setFromCart] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<ShopProduct[]>([]);
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [modal, setModal] = useState<AppModal>(null);
  const [saved, setSaved] = useState<SavedDraft>();
  const [hydrated, setHydrated] = useState(false);
  const [offline, setOffline] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const prefsWarned = useRef(false);
  const area = zone ? `Medellín, ${zone}` : "Medellín, Antioquia";

  useEffect(() => {
    let cancelled = false;
    loadSaved().then(loaded => {
      if (cancelled) return;
      if (loaded.prefs) {
        setBudget(loaded.prefs.budget);
        setPeople(loaded.prefs.people);
        setKnowsPeople(true);
        if (loaded.prefs.hasBudget !== undefined) setHasBudget(loaded.prefs.hasBudget);
        if (loaded.prefs.frequency) setFrequency(loaded.prefs.frequency);
        setZoneState(loaded.prefs.zone);
        if (loaded.prefs.tripCost !== undefined) setTripCost(loaded.prefs.tripCost);
        if (loaded.prefs.stores) setStores(loaded.prefs.stores);
      }
      setCart(loaded.cart);
      setFavorites(loaded.favorites);
      if (loaded.draft) setSaved(loaded.draft);
      setHydrated(true);
    });
    const sync = (connected: boolean | null) => {
      if (!cancelled) setOffline(!(connected ?? true));
    };
    NetInfo.fetch().then(state => sync(state.isConnected)).catch(() => undefined);
    const unsubscribe = NetInfo.addEventListener(state => sync(state.isConnected));
    return () => {
      cancelled = true;
      unsubscribe();
      activeRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveCart(cart);
    saveFavorites(favorites);
    void savePrefs({ budget, people, zone, tripCost, hasBudget, frequency, stores }).then(ok => {
      // Said once per session: the setting still applies now, it just won't survive a restart.
      if (!ok && !prefsWarned.current) {
        prefsWarned.current = true;
        toast.error("No pudimos guardar tus preferencias en este dispositivo. Siguen activas hasta que cierres Rinde.");
      }
    });
  }, [cart, favorites, budget, people, zone, tripCost, hasBudget, frequency, stores, hydrated]);

  useEffect(() => {
    if (!hydrated || !items.length) return;
    const draft = { budget, people, zone, items, hasBudget, frequency };
    setSaved(draft);
    saveDraft(draft);
  }, [budget, people, zone, items, hasBudget, frequency, hydrated]);

  function go(next: number) {
    setStep(next);
  }

  function invalidate() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setRefreshing(false);
    setDeciding(null);
    setResult(undefined);
  }

  // Runs one plan request (new list, re-check, or trade-off decision) and streams verification progress.
  const run = useCallback(
    async (request: (onProgress: (p: VerifyProgress) => void, signal: AbortSignal) => Promise<PlanResult>, mode: "new" | "background" | "decide", key?: string) => {
      if (mode === "background" && activeRequest.current) return;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setProgress([]);
      if (mode === "background") setRefreshing(true);
      else if (mode === "decide") setDeciding(key ?? null);
      else setStep(PHASE.checking);
      try {
        const data = await request(p => {
          if (!controller.signal.aborted) setProgress(previous => [...previous.filter(x => x.store !== p.store), p]);
        }, controller.signal);
        if (!controller.signal.aborted) {
          setResult(data);
          setItemStatus(itemStatuses(data.plan));
          if (mode === "new") setStep(PHASE.results);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "No hay conexión. Tu lista sigue guardada.");
          if (mode === "new") setStep(PHASE.budget);
        }
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setRefreshing(false);
          setDeciding(null);
        }
      }
    },
    [],
  );

  const plan = useCallback(
    (body: PlanRequest, mode: "new" | "background") => run((onProgress, signal) => createPlan(body, onProgress, signal), mode),
    [run],
  );

  useEffect(() => {
    if (!pathname.startsWith("/plan") || step !== PHASE.results || !result) return;
    const timer = setInterval(() => {
      if (!offline && AppState.currentState === "active") void plan({ listId: result.listId }, "background");
    }, 5 * 60000);
    return () => clearInterval(timer);
  }, [pathname, step, result, plan, offline]);

  function openPlanner(useCart = true) {
    invalidate();
    setProduct(null);
    setModal(null);
    const hasCart = useCart && cart.length > 0;
    setFromCart(hasCart);
    if (hasCart) setItemsState(mergeItems(items, toListItems(cart)));
    setStep(PHASE.list);
    router.push("/plan");
  }

  function explore() {
    setProduct(null);
    router.push("/");
  }

  function addProduct(next: ShopProduct) {
    const existing = cart.find(line => line.product.id === next.id);
    const quantity = (existing?.count || 0) + 1;
    if (!existing && cart.length >= 20) {
      toast.error("Puedes comparar hasta 20 productos por lista.");
      return;
    }
    if (quantity > 99 || next.pack * quantity > 1000000) {
      toast.error("Llegaste al límite de cantidad para este producto.");
      return;
    }
    if (isFresh(next.offer) && quantity > next.offer!.stock) {
      toast.error("La cantidad supera las existencias informadas por la tienda.");
      return;
    }
    setCart(previous => {
      const line = previous.find(item => item.product.id === next.id);
      return line
        ? previous.map(item => (item.product.id === next.id ? { product: next, count: item.count + 1 } : item))
        : [...previous, { product: next, count: 1 }];
    });
    if (!existing) toast.success(`${next.name} en tu lista.`, { duration: 1800 });
    if (next.offer) void recordPick(next.id);
  }

  function removeProduct(id: string) {
    setCart(previous => previous.flatMap(line => (line.product.id === id ? (line.count > 1 ? [{ ...line, count: line.count - 1 }] : []) : [line])));
  }

  function deleteLine(id: string) {
    setCart(previous => previous.filter(line => line.product.id !== id));
  }

  function clearCart() {
    setCart([]);
    toast.success("Lista vacía. Tus planes y favoritos siguen guardados.");
  }

  function favoriteProduct(next: ShopProduct) {
    if (!favorites.some(item => item.id === next.id) && favorites.length >= 100) {
      toast.error("Puedes guardar hasta 100 favoritos.");
      return;
    }
    setFavorites(previous => (previous.some(item => item.id === next.id) ? previous.filter(item => item.id !== next.id) : [...previous, next]));
  }

  function resume() {
    if (!saved) return;
    invalidate();
    setBudget(saved.budget);
    setPeople(saved.people);
    if (saved.hasBudget !== undefined) setHasBudget(saved.hasBudget);
    if (saved.frequency) setFrequency(saved.frequency);
    setZoneState(saved.zone);
    setItemsState(saved.items);
    setFromCart(false);
    setModal(null);
    setStep(PHASE.list);
    router.push("/plan");
  }

  // A product with a real offer gets its own page (/product/:id); a list idea without a price keeps the dialog.
  function openProduct(next: ShopProduct) {
    if (!next.offer) {
      setProduct(next);
      return;
    }
    void recordPick(next.id);
    rememberProduct(next);
    setProduct(null);
    router.push(`/product/${encodeURIComponent(next.id)}`);
  }

  function searchProduct() {
    if (!product) return;
    setProduct(null);
    router.push(searchHref(product.term, { stores }));
  }

  function setZone(next: string) {
    invalidate();
    setZoneState(next);
    setModal(null);
    if (step >= PHASE.checking) setStep(PHASE.budget);
  }

  function setPrefs(next: Prefs) {
    if (next.budget !== undefined) setBudget(next.budget);
    if (next.hasBudget !== undefined) setHasBudget(next.hasBudget);
    if (next.frequency !== undefined) setFrequency(next.frequency);
    if (next.people !== undefined) {
      setPeople(next.people);
      setKnowsPeople(true);
    }
    if (next.tripCost !== undefined) setTripCost(next.tripCost);
    if (next.stores !== undefined) setStores(next.stores.length === 3 ? [] : next.stores);
  }

  // Edits the list in place, on any phase. A plan for the old list no longer applies, but what it found
  // for each item (itemStatus) stays visible until the next comparison.
  function setItems(list: ListItem[]) {
    if (result) invalidate();
    setItemsState(list);
    setFromCart(false);
  }

  function compare(opts: { hasBudget?: boolean } = {}) {
    if (!items.length) return;
    const withBudget = opts.hasBudget ?? hasBudget;
    if (opts.hasBudget !== undefined) setHasBudget(opts.hasBudget);
    setResult(undefined);
    // The API needs a budget; without one we send its ceiling and the screens never show a budget figure.
    void plan({ budget: withBudget ? budget : NO_BUDGET, area, tripCost, items }, "new");
  }

  function refresh() {
    if (result) void plan({ listId: result.listId }, "background");
  }

  function decide(key: string, decision: "accept" | "reject") {
    if (!result) return;
    const { basketId } = result;
    void run((onProgress, signal) => decideTradeoff(basketId, key, decision, onProgress, signal), "decide", key);
  }

  function deleteSaved() {
    invalidate();
    setSaved(undefined);
    setItemsState([]);
    setModal(null);
    deleteDraft();
    if (pathname.startsWith("/plan")) setStep(PHASE.list);
    toast.success("Plan eliminado. Tu lista no ha cambiado.");
  }

  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.count, 0), [cart]);

  const value: AppStateValue = {
    step, budget, hasBudget, frequency, people, knowsPeople, zone, area, tripCost, stores, items, result, itemStatus, progress, refreshing, deciding, fromCart,
    cart, cartCount, favorites, product, modal, saved, hydrated, offline,
    go, openPlanner, explore,
    openProduct, closeProduct: () => setProduct(null),
    openModal: setModal, closeModal: () => setModal(null),
    setZone, setPrefs, setItems, compare, refresh, decide, resume, deleteSaved,
    addProduct, removeProduct, deleteLine, clearCart, favoriteProduct, searchProduct,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/** Adds list items not already there (same name), keeping what the person had. */
export function mergeItems(current: ListItem[], incoming: ListItem[]): ListItem[] {
  const names = new Set(current.map(i => i.name.trim().toLowerCase()));
  return [...current, ...incoming.filter(i => !names.has(i.name.trim().toLowerCase()))].slice(0, 20);
}
