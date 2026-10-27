import type { ShopProduct } from "./shop";

// The product a screen just showed, so its detail page opens instantly without asking the API again.
// A fresh load or a shared link has nothing here and prices the product from /api/basket instead.
const seen = new Map<string, ShopProduct>();

export function rememberProduct(product: ShopProduct) {
  seen.set(product.id, product);
  if (seen.size > 200) seen.delete(seen.keys().next().value!);
}

export function recallProduct(id: string) {
  return seen.get(id);
}
