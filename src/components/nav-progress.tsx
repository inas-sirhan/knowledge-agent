"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A slim top progress bar that turns on the moment the URL starts changing
 * and turns off once the new route has mounted. Sits above the page chrome
 * so navigation never feels "frozen".
 */
export default function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Intercept link clicks anywhere on the page.
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (target.target === "_blank") return;
      // Only same-origin app links
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      setVisible(true);
      setProgress(15);
    }
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      setProgress((p) => (p < 85 ? p + (90 - p) * 0.08 : p));
    }, 120);
    return () => clearInterval(t);
  }, [visible]);

  // Fade out once route changed.
  useEffect(() => {
    if (!visible) return;
    setProgress(100);
    const t = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
    return () => clearTimeout(t);
    // re-run on every URL change
  }, [pathname, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease-out",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "hsl(var(--primary))",
          transition: "width 180ms ease-out",
          boxShadow: "0 0 8px hsl(var(--primary))",
        }}
      />
    </div>
  );
}
