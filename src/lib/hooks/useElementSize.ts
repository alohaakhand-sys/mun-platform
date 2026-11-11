"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measure an element's live pixel size via ResizeObserver.
 *
 * SSR-safe (client-only effect, guards a missing `ResizeObserver`), rAF-batched to dodge the
 * "ResizeObserver loop completed with undelivered notifications" warning, and equality-guarded so
 * it only re-renders on a real size change. Cleanup is idempotent → survives React 19 strict-mode
 * double-mount.
 *
 *   const [ref, { width, height }] = useElementSize<HTMLDivElement>();
 *   return <div ref={ref} />;
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const apply = (width: number, height: number) => {
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    // Seed synchronously so the first paint already has dimensions.
    const rect = el.getBoundingClientRect();
    apply(Math.round(rect.width), Math.round(rect.height));

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(Math.round(cr.width), Math.round(cr.height)));
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return [ref, size] as const;
}
