import { Share } from "react-native";
import { cop } from "./market";
import { packLabel, provenance, STORE_NAME, type Plan } from "./planner";

export function receiptLines(plan: Plan, area: string, checkedAt: string) {
  const now = Date.now();
  return [
    "Rinde · Haz que tu plata rinda más.",
    `${area} · ${new Date(checkedAt).toLocaleString("es-CO")}`,
    ...plan.stores.map((s, i) => [
      `Parada ${i + 1}: ${STORE_NAME[s.retailer]} · ${cop(s.subtotal)}`,
      ...s.lines.map(l => `• ${l.candidate.name}: ${l.packs} × ${packLabel(l.candidate)} · ${cop(l.lineTotal)}\n  ${l.reason}\n  ${provenance(l.candidate, now)} · ${l.candidate.url}`),
    ].join("\n")),
    ...plan.unavailable.map(u => `SIN COTIZAR: ${u.label}. ${u.reason}. No incluido en el total.`),
    `Total ${cop(plan.total)} · Presupuesto ${cop(plan.budget)} · ${plan.stops} ${plan.stops === 1 ? "parada" : "paradas"}`,
    plan.remaining >= 0 ? `Te quedan ${cop(plan.remaining)}` : `Exceso: ${cop(-plan.remaining)}`,
    plan.baseline && plan.savings !== null && plan.savings > 0 ? `Ahorro ${cop(plan.savings)}. ${plan.baseline.description}.` : "",
    "Precios observados en el canal online. No incluye domicilio ni transporte. Disponibilidad por confirmar en la tienda.",
  ].filter(Boolean);
}

// v1 comparte el comprobante como texto (funciona en Expo Go, web y tiendas).
export async function shareReceipt(plan: Plan, area: string, checkedAt: string) {
  const shared = await Share.share({ message: receiptLines(plan, area, checkedAt).join("\n\n"), title: "Mi mercado con Rinde" });
  return shared.action === Share.dismissedAction ? "dismissed" : "shared";
}
