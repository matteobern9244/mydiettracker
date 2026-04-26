import { useEffect, useState } from "react";

const KEY = "dieto-theme";

export function useTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(KEY) as "light" | "dark" | null;
    if (stored) return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle, setTheme: setThemeState };
}
