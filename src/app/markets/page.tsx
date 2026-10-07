"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ArcMarketTable, formatUsd } from "@/components/app/arc-market-table";
import {
  ARC_ALL,
  ARC_CHAIN,
  ARC_NEW,
  ARC_TRENDING,
  ARC_TOTAL_LIQUIDITY,
  ARC_TOTAL_VOLUME_24H,
  type ArcToken,
} from "@/lib/arc-data";
import { useArcLive } from "@/hooks/use-arc-live";
import { cn } from "@/lib/utils";

type Tab = "hot" | "gainers" | "losers" | "new" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "gainers", label: "Top Gainers" },
  { key: "losers", label: "Top Losers" },
  { key: "new", label: "New Listings" },
  { key: "all", label: "All Pairs" },
];

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("hot");
  const [query, setQuery] = useState("");

  /** Each tab surfaces 50 ARC pairs. */
  const PAGE_SIZE = 50;

  const { mergeAll, totals } = useArcLive();

  /**
   * The catalog fixes which pairs exist; the live feed decides their order and
   * every number in the table.
   */
  const board = useMemo(() => {
    const all = mergeAll(ARC_ALL);
    const byVolume = [...all].sort((a, b) => b.volume.h24 - a.volume.h24);
    const byChange = [...all].sort((a, b) => b.change.h24 - a.change.h24);

    const lists: Record<Tab, ArcToken[]> = {
      hot: mergeAll(ARC_TRENDING).slice(0, PAGE_SIZE),
      gainers: byChange.filter((t) => t.change.h24 > 0).slice(0, PAGE_SIZE),
      losers: byChange
        .filter((t) => t.change.h24 < 0)
        .reverse()
        .slice(0, PAGE_SIZE),
      new: mergeAll(ARC_NEW).slice(0, PAGE_SIZE),
      all: all.slice(0, PAGE_SIZE),
    };

    return { lists, hotSymbols: byVolume.slice(0, 5).map((t) => t.symbol) };
  }, [mergeAll]);

  const base = board.lists[tab];

  const tokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.pair.toLowerCase().includes(q),
    );
  }, [base, query]);

  const hotSymbols = board.hotSymbols;

  return (
    <AppShell current="/markets" title="Markets">
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* ---- ARC network summary ---- */}
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Network", value: ARC_CHAIN.toUpperCase(), sub: "Live pools, read on-chain" },
            { label: "24h Volume", value: formatUsd(totals.volume || ARC_TOTAL_VOLUME_24H), sub: "All tracked pairs" },
            { label: "Liquidity", value: formatUsd(totals.liquidity || ARC_TOTAL_LIQUIDITY), sub: "All tracked pools" },
          ].map((card) => (
            <div key={card.label} className="home-glass rounded-2xl p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-2 font-heading text-xl font-bold tracking-tight text-foreground">
                {card.value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </section>

        <section className="home-glass rounded-2xl p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  className={cn(
                    "relative z-10 h-9 flex-1 rounded-full text-xs font-semibold transition-colors",
                    active
                      ? "bg-white/[0.06] font-bold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {tokens.length} ARC pairs · {TABS.find((t) => t.key === tab)?.label}
            </p>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ARC pairs"
                aria-label="Search ARC pairs"
                className="h-9 w-56 rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          {tokens.length ? (
            <ArcMarketTable tokens={tokens} hotSymbols={hotSymbols} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No ARC pairs match “{query}”.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
