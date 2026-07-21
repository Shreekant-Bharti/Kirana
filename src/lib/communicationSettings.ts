// Persist communication preferences in localStorage.
// Keys are namespaced to avoid collisions.

const SHOP_NAME_KEY = "bharti-shop-name";
const INCLUDE_SHOP_NAME_KEY = "bharti-include-shop-name";

export function getShopName(): string {
  if (typeof window === "undefined") return "Bharti Udhari";
  return localStorage.getItem(SHOP_NAME_KEY) || "Bharti Udhari";
}

export function setShopName(v: string): void {
  localStorage.setItem(SHOP_NAME_KEY, v);
}

export function getIncludeShopName(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem(INCLUDE_SHOP_NAME_KEY);
  return val === null || val === "true";
}

export function setIncludeShopName(v: boolean): void {
  localStorage.setItem(INCLUDE_SHOP_NAME_KEY, String(v));
}
