"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Search, TrendingUp, X } from "lucide-react";
import { formatArcPrice, formatUsd } from "@/components/app/arc-market-table";
import { cn } from "@/lib/utils";

/**
 * Top-bar token search.
 *
 * Paste an address (0x + 40 hex) or type a symbol / name: the box calls
 * /api/search, which merges the local ARC catalog with DexScreener discovery
 * and overlays live numbers from Peach. Selecting a row opens that pair on the
 * spot terminal.
 *
 * Keyboard: ⌘K / Ctrl+K focuses, ↑↓ moves, Enter opens, Esc closes. The list
 * is a plain div list with aria-activedescendant so the input keeps focus while
 * the user arrows through results.
 */

type SearchHit = {
  pairAddress: string;
  address: string;
  symbol: string;
  name: string;
  quote: string;
  pair: string;
  dex: string;
  image: string | null;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  source: "catalog" | "dexscreener";
};

/** Address-shaped input skips the debounce — it is a lookup, not a search. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DEBOUNCE_MS = 250;

export function TokenSearch() {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Panel geometry, measured from the input so it can never cover it. */
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  /** Recent symbols shown before the user types; keeps the box useful empty. */
  const [recent, setRecent] = useState<SearchHit[]>([]);

  /**
   * The panel is portalled to <body> so it escapes the header's stacking
   * context and its 64px box.
   *
   * The input lives in a `position: fixed` header, so it sits at a stable
   * VIEWPORT coordinate while the document scrolls underneath it. Coordinates
   * here are therefore viewport-space: no scroll offset is ever added. While
   * the panel is open a rAF loop re-reads the rect, which covers layout shifts
   * (scrollbar appearing, the header resizing) without a scroll listener.
   */
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const el = inputRef.current?.closest("div");
      if (el) {
        const r = el.getBoundingClientRect();
        setAnchor({ left: r.left, top: r.bottom + 8, width: Math.max(r.width, 352) });
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/search?q=arc", { signal: controller.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((b: { hits?: SearchHit[] }) => setRecent((b.hits ?? []).slice(0, 6)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  /** ⌘K / Ctrl+K anywhere focuses the field, like the hint promises. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Panel is portalled to <body>, so it needs its own ref for outside-click. */
  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * Click outside closes the panel.
   *
   * The panel is portalled to <body>, so it is NOT a descendant of `boxRef`:
   * without the panelRef check a mousedown on a result row counted as an
   * outside click, closed the panel on mousedown, and the row's onClick never
   * fired — clicks appeared dead while Enter still worked.
   */
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const trimmed = query.trim();
  const ready = ADDRESS.test(trimmed) || trimmed.length >= 2;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const delay = ADDRESS.test(trimmed) ? 0 : DEBOUNCE_MS;

    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((b: { hits?: SearchHit[] }) => {
          setHits(b.hits ?? []);
          setActive(0);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, delay);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, ready]);

  /** What the panel lists: live results once the query is usable, else recents. */
  const shown = useMemo(
    () => (ready && trimmed.length > 0 ? hits : recent),
    [ready, trimmed, hits, recent],
  );

  const go = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      router.push(`/trade?pair=${encodeURIComponent(hit.pairAddress)}`);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(shown[active]);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        className={cn(
          "flex h-9 w-60 items-center gap-2.5 rounded-xl border bg-white/[0.04] px-3 transition-colors",
          open ? "border-primary/50" : "border-white/10 hover:border-white/20",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search pairs or paste address…"
          aria-label="Search pairs or paste an address"
          aria-expanded={open}
          aria-controls="token-search-results"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setHits([]);
              inputRef.current?.focus();
            }}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/80">
            ⌘K
          </span>
        )}
      </div>

      {/* ---- panel: portalled to <body>, measured from the input ---- */}
      {open && anchor
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                position: "fixed",
                left: anchor.left,
                top: anchor.top,
                width: anchor.width,
              }}
              className="home-glass z-[999] overflow-hidden rounded-2xl"
            >
          <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              {trimmed.length > 0 ? <Search className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {trimmed.length > 0 ? "Results" : "Popular pairs"}
            </span>
            {trimmed.length > 0 ? (
              <span className="font-mono text-[9px] text-muted-foreground/70">
                {loading ? "searching…" : `${shown.length} · dexscreener + peach`}
              </span>
            ) : null}
          </div>

          <div className="relative z-10 max-h-[21rem] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-4 py-7 text-center">
                {trimmed.length > 0 && !loading ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      No ARC pair matches “{trimmed}”
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground/60">
                      Try a symbol, a name, or paste a contract address
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">Loading pairs…</div>
                )}
              </div>
            ) : (
              <ul role="listbox" id="token-search-results" className="py-1">
                {shown.map((hit, index) => {
                  const up = hit.change24h >= 0;
                  return (
                    <li key={hit.pairAddress} role="none">
                      <button
                        id={`token-opt-${hit.pairAddress}`}
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(hit)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                          index === active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
                        )}
                      >
                        {hit.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.image}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full border border-white/10 bg-white/5 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.07] font-mono text-[10px] font-bold text-muted-foreground">
                            {hit.symbol.slice(0, 2).toUpperCase()}
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {hit.symbol}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              /{hit.quote}
                            </span>
                            {hit.dex ? (
                              <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-px text-[9px] font-medium text-muted-foreground">
                                {hit.dex}
                              </span>
                            ) : null}
                          </div>
                          <span className="block truncate text-[10px] text-muted-foreground/80">
                            {hit.name}
                          </span>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="font-mono text-xs tabular-nums text-foreground">
                            {formatArcPrice(hit.price)}
                          </div>
                          <div
                            className={cn(
                              "font-mono text-[10px] font-semibold tabular-nums",
                              up ? "text-success" : "text-danger",
                            )}
                          >
                            {up ? "+" : ""}
                            {hit.change24h.toFixed(2)}%
                          </div>
                        </div>

                        <div className="hidden w-[4.5rem] shrink-0 text-right sm:block">
                          <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                            {formatUsd(hit.volume24h)}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                            vol 24h
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="relative z-10 flex items-center gap-3 border-t border-white/[0.08] px-3.5 py-1.5 text-[9px] text-muted-foreground/60">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 font-mono">↑↓</kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 font-mono">↵</kbd> open
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 font-mono">esc</kbd> close
            </span>
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
