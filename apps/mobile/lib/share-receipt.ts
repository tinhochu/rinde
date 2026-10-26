import { Share } from "react-native";
import { Basket, cop, LookupResult } from "./market";

export function receiptLines(basket: Basket, budget: number, result: LookupResult, comparison?: Basket) {
  const savings = comparison && basket.complete ? Math.max(0, comparison.total - basket.total) : null;
  const unavailable = result.rows.filter(row => !basket.assignments.some(a => a.item.id === row.item.id));
  return [
    "Rinde · Haz que tu plata rinda más.",
    `${result.area} · ${new Date(result.checkedAt).toLocaleString("es-CO")}`,
    basket.complete ? "Lista completa" : "Plan parcial: faltan productos sin precio verificable",
    ...basket.assignments.map(a => `${a.item.name}: ${a.packs} empaque(s) · ${a.offer.store} · ${cop(a.total)}\n${cop(a.offer.price)} por empaque · ${a.offer.url}\nTienda online · observado ${new Date(a.offer.observedAt).toLocaleString("es-CO")} · EAN: ${a.offer.ean || "No informado"}${a.substitution && a.alternative ? `\nCambio de marca: ${a.item.brand} → ${a.offer.brand}. Antes ${cop(a.alternative.total)} (${a.alternative.offer.store}, canal online, ${a.alternative.offer.observedAt}, ${a.alternative.offer.url}); diferencia ${cop(a.alternative.total - a.total)}.` : ""}`),
    ...unavailable.map(row => `SIN COTIZAR: ${row.item.name}. No incluido en el total. ${row.reasons.join(" ") || "Sin oferta compatible con tus preferencias."}`),
    `Total ${cop(basket.total)} · Presupuesto ${cop(budget)} · ${basket.stops} parada(s)`,
    `${budget >= basket.total ? basket.complete ? "Saldo" : "Saldo provisional" : "Exceso"}: ${cop(Math.abs(budget - basket.total))}`,
    savings === null ? "Sin canasta completa de comparación: no calculamos ahorro." : `Ahorro ${cop(savings)} vs. tu lista completa en ${comparison!.store} (${cop(comparison!.total)}). Marcas y empaques pueden variar; no se afirma coincidencia de todos los EAN. ${cop(comparison!.total)} − ${cop(basket.total)} = ${cop(savings)}.`,
    "Ofertas consultadas, no catálogo exhaustivo. No incluye domicilio ni transporte. Disponibilidad local por confirmar en la tienda.",
  ];
}

// v1 comparte el comprobante como texto (funciona en Expo Go, web y tiendas).
// La imagen PNG del comprobante queda para una dev build (react-native-view-shot).
export async function shareReceipt(basket: Basket, budget: number, result: LookupResult, comparison?: Basket) {
  const shared = await Share.share({ message: receiptLines(basket, budget, result, comparison).join("\n\n"), title: "Mi mercado con Rinde" });
  return shared.action === Share.dismissedAction ? "dismissed" : "shared";
}
