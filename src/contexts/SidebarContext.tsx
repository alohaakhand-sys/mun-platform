"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

// Default = expanded. Nested providers (e.g. the mobile sheet) can force a value.
export const SidebarContext = createContext<SidebarState>({
  collapsed: false,
  toggle: () => {},
  setCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      setCollapsedState(localStorage.getItem("sidebar_collapsed") === "1");
    } catch {}
  }, []);

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try { localStorage.setItem("sidebar_collapsed", v ? "1" : "0"); } catch {}
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed(!collapsed), setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
