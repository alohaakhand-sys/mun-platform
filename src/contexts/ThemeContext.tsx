"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const STORAGE_KEY = "mun-theme";

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) || "light";
      setThemeState(stored);
      applyTheme(stored);
    } catch {
      applyTheme("light");
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    applyTheme(t);
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
