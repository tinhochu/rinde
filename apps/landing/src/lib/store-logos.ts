import d1 from "@/assets/stores/d1.png";
import jumbo from "@/assets/stores/jumbo.png";
import exito from "@/assets/stores/exito.png";
import carulla from "@/assets/stores/carulla.png";

/** Each store's own logo (the same files the app shows), by the store name the API returns. */
export const STORE_LOGOS: Record<string, string> = { D1: d1, Jumbo: jumbo, "Éxito": exito, Carulla: carulla };
export const STORE_ORDER = ["D1", "Jumbo", "Éxito", "Carulla"] as const;
