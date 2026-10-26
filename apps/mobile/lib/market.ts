export type Store = "Éxito" | "Jumbo" | "D1";
export const STORES: Store[] = ["Éxito", "Jumbo", "D1"];
export type Unit = "g" | "ml" | "und";
export type ListItem = { id: string; name: string; quantity: number; unit: Unit; brand: string; allowSubstitution: boolean };
export type Offer = { id: string; store: Store; name: string; brand: string; ean: string; price: number; stock: number; pack: number; unit: Unit; image: string; url: string; observedAt: string; channel: "Tienda online" };
export type LookupRow = { item: ListItem; offers: Offer[]; reasons: string[] };
export type LookupResult = { rows: LookupRow[]; checkedAt: string; area: string };
export type Assignment = { item: ListItem; offer: Offer; packs: number; total: number; alternative?: { name: string; total: number; offer: Offer }; substitution: boolean };
export type Basket = { store: string; assignments: Assignment[]; total: number; stops: number; complete: boolean };
export const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
export const normalized = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function parseList(text: string): ListItem[] {
  return text.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean).slice(0, 20).map((line, index) => {
    const match = normalized(line).match(/(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kg|gramos?|gr|g|litros?|lt|l|mililitros?|ml|unidades?|und|uds)?\b/);
    let quantity = match ? Number(match[1].replace(",", ".")) : 1;
    const rawUnit = match?.[2] || "und";
    let unit: Unit = "und";
    if (/^(kg|kilo)/.test(rawUnit)) { quantity *= 1000; unit = "g"; }
    else if (/^(g|gr)/.test(rawUnit)) unit = "g";
    else if (/^(l|lt|litro)/.test(rawUnit)) { quantity *= 1000; unit = "ml"; }
    else if (rawUnit === "ml" || rawUnit.startsWith("mililitro")) unit = "ml";
    const name = (match ? line.slice(0, match.index) + line.slice((match.index || 0) + match[0].length) : line).replace(/^\s*(de\s+)?/i, "").replace(/\s+/g, " ").trim();
    return { id: `item-${index}-${Date.now()}`, name: name || line, quantity, unit, brand: "", allowSubstitution: true };
  });
}

export function quantityLabel(quantity: number, unit: Unit) {
  if (unit === "g" && quantity >= 1000) return `${quantity / 1000} kg`;
  if (unit === "ml" && quantity >= 1000) return `${quantity / 1000} L`;
  return `${quantity} ${unit}`;
}

export function choices(row: LookupRow): Assignment[] {
  return row.offers.filter(o => o.unit === row.item.unit && o.pack > 0 && (!row.item.brand || row.item.allowSubstitution || normalized(o.brand) === normalized(row.item.brand))).map(offer => {
    const packs = Math.ceil(row.item.quantity / offer.pack);
    const baseline = row.item.brand ? row.offers.filter(o => normalized(o.brand) === normalized(row.item.brand) && o.unit === offer.unit && o.pack === offer.pack).sort((a, b) => a.price - b.price)[0] : undefined;
    const substitution = !!baseline && normalized(offer.brand) !== normalized(row.item.brand) && baseline.pack === offer.pack;
    return { item: row.item, offer, packs, total: Math.round(offer.price * packs), substitution, alternative: substitution && baseline ? { name: baseline.name, total: Math.round(baseline.price * packs), offer: baseline } : undefined };
  }).filter(a => a.packs <= a.offer.stock && (!row.item.brand || normalized(a.offer.brand) === normalized(row.item.brand) || (row.item.allowSubstitution && a.substitution))).sort((a, b) => a.total - b.total);
}

export function optimize(result: LookupResult) {
  const candidates = result.rows.map(choices);
  const assignments = candidates.filter(a => a.length).map(a => a[0]);
  const split: Basket = { store: "Compra dividida", assignments, total: assignments.reduce((s, a) => s + a.total, 0), stops: new Set(assignments.map(a => a.offer.store)).size, complete: assignments.length === result.rows.length };
  const singles: Basket[] = STORES.map(store => {
    const selected = candidates.map(a => a.find(c => c.offer.store === store)).filter((a): a is Assignment => !!a);
    return { store, assignments: selected, total: selected.reduce((s, a) => s + a.total, 0), stops: selected.length ? 1 : 0, complete: selected.length === result.rows.length };
  });
  const single = singles.filter(b => b.complete).sort((a, b) => a.total - b.total)[0];
  const savings = single && split.complete ? single.total - split.total : null;
  return { split, single, singles, savings, unavailable: result.rows.filter((_, i) => !candidates[i].length) };
}
