import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "bharti-theme";

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  const isDark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function initTheme() {
  if (typeof window === "undefined") return;
  const saved = (localStorage.getItem(KEY) as ThemeMode | null) ?? "system";
  apply(saved);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    const cur = (localStorage.getItem(KEY) as ThemeMode | null) ?? "system";
    if (cur === "system") apply(cur);
  });
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(KEY) as ThemeMode | null) ?? "system";
  });
  useEffect(() => {
    localStorage.setItem(KEY, mode);
    apply(mode);
  }, [mode]);
  return { mode, setMode };
}
