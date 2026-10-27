import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { usePathname, useRouter } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import type { ListItem } from "./market";
import { createPlan, decideTradeoff, type PlanRequest, type PlanResult, type VerifyProgress } from "./planner";
import { deleteDraft, loadSaved, saveCart, saveDraft, saveFavorites, savePrefs } from "./storage";
import { isFresh, toListItems, type CartLine, type SavedDraft, type ShopProduct } from "./shop";
import { recordPick } from "./history";
import { toast } from "./toast";

export type AppModal = "area" | "saved" | "help" | "privacy" | null;

type AppStateValue = {
  step: number; budget: number; people: number; zone: string; area: string; tripCost: number;
  items: ListItem[]; result?: PlanResult; progress: VerifyProgress[]; refreshing: boolean; deciding: string | null; fromCart: boolean;
  cart: CartLine[]; cartCount: number; favorites: ShopProduct[];
  product: ShopProduct | null; modal: AppModal; saved?: SavedDraft;
  hydrated: boolean; offline: boolean; externalSearch?: { term: string; nonce: number };
  go: (next: number) => void;
  openPlanner: (useCart?: boolean) => void;
  explore: () => void;
  openProduct: (next: ShopProduct) => void;
  closeProduct: () => void;
  openModal: (next: AppModal) => void;
  closeModal: () => void;
  setZone: (next: string) => void;
  setBudgetPeople: (nextBudget: number, nextPeople: number) => void;
  setPrefs: (next: { budget?: number; people?: number; tripCost?: number }) => void;
  setItems: (list: ListItem[]) => void;
  compare: (list: ListItem[]) => void;
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
  const [people, setPeople] = useState(4);
  // COP an extra store stop is worth to the user; the planner only adds a stop when it saves more.
  const [tripCost, setTripCost] = useState(10000);
  const [zone, setZoneState] = useState("");
  const [items, setItemsState] = useState<ListItem[]>([]);
  const [result, setResult] = useState<PlanResult>();
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
  const [externalSearch, setExternalSearch] = useState<{ term: string; nonce: number }>();
  const activeRequest = useRef<AbortController | null>(null);
  const area = zone ? `Medellín, ${zone}` : "Medellín, Antioquia";

  useEffect(() => {
    let cancelled = false;
    loadSaved().then(loaded => {
      if (cancelled) return;
      if (loaded.prefs) {
        setBudget(loaded.prefs.budget);
        setPeople(loaded.prefs.people);
        setZoneState(loaded.prefs.zone);
        if (loaded.prefs.tripCost !== undefined) setTripCost(loaded.prefs.tripCost);
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
    savePrefs({ budget, people, zone, tripCost });
  }, [cart, favorites, budget, people, zone, tripCost, hydrated]);

  useEffect(() => {
    if (!hydrated || !items.length) return;
    const draft = { budget, people, zone, items };
    setSaved(draft);
    saveDraft(draft);
  }, [budget, people, zone, items, hydrated]);

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
      else setStep(3);
      try {
        const data = await request(p => {
          if (!controller.signal.aborted) setProgress(previous => [...previous.filter(x => x.store !== p.store), p]);
        }, controller.signal);
        if (!controller.signal.aborted) {
          setResult(data);
          if (mode === "new") setStep(4);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "No hay conexión. Tu lista sigue guardada.");
          if (mode === "new") setStep(2);
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
    if (!pathname.startsWith("/plan") || step !== 4 || !result) return;
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
    if (hasCart) setItemsState(toListItems(cart));
    setStep(0);
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
      toast.error("Puedes comparar hasta 20 productos por carrito.");
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
    if (!existing) toast.success(`${next.name} en tu carrito.`, { duration: 1800 });
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
    toast.success("Carrito vacío. Tus listas y favoritos siguen guardados.");
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
    setZoneState(saved.zone);
    setItemsState(saved.items);
    setFromCart(false);
    setModal(null);
    setStep(saved.items.length ? 2 : 0);
    router.push("/plan");
  }

  function searchProduct() {
    if (!product) return;
    setExternalSearch({ term: product.term, nonce: Date.now() });
    setProduct(null);
    router.push("/");
  }

  function setZone(next: string) {
    invalidate();
    setZoneState(next);
    setModal(null);
    if (step === 3 || step === 4) setStep(2);
  }

  function setBudgetPeople(nextBudget: number, nextPeople: number) {
    setBudget(nextBudget);
    setPeople(nextPeople);
    setStep(fromCart ? 2 : 1);
  }

  function setPrefs(next: { budget?: number; people?: number; tripCost?: number }) {
    if (next.budget !== undefined) setBudget(next.budget);
    if (next.people !== undefined) setPeople(next.people);
    if (next.tripCost !== undefined) setTripCost(next.tripCost);
  }

  function setItems(list: ListItem[]) {
    invalidate();
    setItemsState(list);
    setFromCart(false);
    setStep(2);
  }

  function compare(list: ListItem[]) {
    setItemsState(list);
    setResult(undefined);
    void plan({ budget, area, tripCost, items: list }, "new");
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
    if (pathname.startsWith("/plan")) setStep(0);
    toast.success("Lista eliminada. Tu carrito no ha cambiado.");
  }

  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.count, 0), [cart]);

  const value: AppStateValue = {
    step, budget, people, zone, area, tripCost, items, result, progress, refreshing, deciding, fromCart,
    cart, cartCount, favorites, product, modal, saved, hydrated, offline, externalSearch,
    go, openPlanner, explore,
    openProduct: (next: ShopProduct) => { if (next.offer) void recordPick(next.id); setProduct(next); }, closeProduct: () => setProduct(null),
    openModal: setModal, closeModal: () => setModal(null),
    setZone, setBudgetPeople, setPrefs, setItems, compare, refresh, decide, resume, deleteSaved,
    addProduct, removeProduct, deleteLine, clearCart, favoriteProduct, searchProduct,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
