// Print size preference (persisted).
export type PrintSize = "a4" | "thermal58" | "thermal80";
const KEY = "bharti-print-size";

export function getPrintSize(): PrintSize {
  if (typeof window === "undefined") return "a4";
  return (localStorage.getItem(KEY) as PrintSize | null) ?? "a4";
}
export function setPrintSize(v: PrintSize) {
  localStorage.setItem(KEY, v);
}
