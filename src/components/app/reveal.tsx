"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Fades a block in the first time it scrolls into view.
 *
 * CSS owns the motion (see `.reveal` in globals.css); this only flips one class
 * once, then stops observing. `delay` maps to a preset transition-delay class so
 * siblings can be staggered without inline styles.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger step, 0-5 (70ms each). */
  delay?: 0 | 1 | 2 | 3 | 4 | 5;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion: reveal on the next frame instead of on scroll, so the
    // element is never stuck invisible and no state write sits in the effect
    // body. The CSS turns the motion off on its own.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLElement>}
      className={cn("reveal", `reveal-delay-${delay}`, shown && "reveal-visible", className)}
    >
      {children}
    </Tag>
  );
}

/**
 * Plays the page-entrance animation on every route change.
 *
 * Keying the wrapper on the pathname remounts it on navigation, which restarts
 * the CSS animation without any transition library. Children are read from
 * props, so wrapping a page does not re-render its subtree.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
