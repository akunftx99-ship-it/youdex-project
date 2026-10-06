"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  BarChart3,
  Eye,
  EyeOff,
  Flame,
  Info,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
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

/** How many rows each tab shows. */
const PAGE_SIZE = 50;

/** First paint only — the live feed replaces both as soon as it answers. */
const SNAPSHOT_VOLUME = ARC_TOTAL_VOLUME_24H;
const SNAPSHOT_LIQUIDITY = ARC_TOTAL_LIQUIDITY;

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("hot");
  const [hidden, setHidden] = useState(false);
  const { status, mergeAll, totals } = useArcLive();

  /**
   * Tabs are ranked from live numbers, not the snapshot's frozen order: the
   * catalog supplies identity, the feed decides who is hot, up or down.
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

    return {
      lists,
      hotSymbols: byVolume.slice(0, 5).map((t) => t.symbol),
      top: byVolume[0],
      tracked: all.length,
    };
  }, [mergeAll]);

  const rows = board.lists[tab];
  const top = board.top;
  const totalVolume = totals.volume || SNAPSHOT_VOLUME;
  const totalLiquidity = totals.liquidity || SNAPSHOT_LIQUIDITY;

  return (
    <AppShell current="/app" title="Dashboard">
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* ---- Top row ---- */}
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section className="home-glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Total Balance
                  </p>
                  <button
                    type="button"
                    onClick={() => setHidden((v) => !v)}
                    aria-label={hidden ? "Show balance" : "Hide balance"}
                    className="grid h-5 w-5 place-items-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
                  >
                    {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-heading text-4xl font-bold tracking-tight text-foreground">
                    {hidden ? "••••" : "100.00"}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">USDC</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted-foreground">Today&apos;s PNL</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-success">
                    <TrendingUp className="h-3 w-3" />
                    +0.00$ (+0.00%)
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    {ARC_CHAIN} network
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {board.tracked} pairs tracked
                  </span>
                </div>
              </div>

              <div className="flex min-w-[150px] flex-col gap-2">
                <Link
                  href="/fund"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-5 text-sm font-semibold text-success-foreground shadow-[0_0_16px_rgba(0,255,30,0.22)] transition-all hover:bg-success/90 active:scale-[0.98]"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Deposit
                </Link>
                <span
                  role="button"
                  aria-disabled="true"
                  title="Coming soon"
                  className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-medium text-muted-foreground"
                >
                  Withdraw
                </span>
              </div>
            </div>
          </section>

          <section className="home-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-success" />
                <h2 className="font-heading text-sm font-bold tracking-tight text-foreground">
                  {ARC_CHAIN.toUpperCase()} Market Pulse
                </h2>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  status === "offline"
                    ? "border-danger/25 bg-danger/10 text-danger"
                    : "border-success/25 bg-success/10 text-success",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status === "offline" ? "bg-danger" : "bg-success",
                    status === "live" && "animate-pulse",
                  )}
                />
                {status === "live" ? "Live" : status === "connecting" ? "Syncing" : "Offline"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <BarChart3 className="h-3 w-3" />
                  24h Volume
                </div>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatUsd(totalVolume)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  Liquidity
                </div>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatUsd(totalLiquidity)}
                </p>
              </div>
            </div>

            {top ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Highest volume
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="font-heading text-sm font-bold text-foreground">{top.pair}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatUsd(top.volume.h24)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{top.name}</p>
              </div>
            ) : null}
          </section>
        </div>

        {/* ---- Market table ---- */}
        <section className="home-glass rounded-2xl p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  className={cn(
                    "relative z-10 flex h-9 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors",
                    active
                      ? "bg-white/[0.06] font-bold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                  {entry.key === "hot" ? (
                    <Flame className="h-3 w-3 text-danger" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">
              {TABS.find((t) => t.key === tab)?.label} · showing {rows.length} pairs
            </p>
            <Link
              href="/markets"
              className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
            >
              View all markets
            </Link>
          </div>

          <ArcMarketTable tokens={rows} hotSymbols={board.hotSymbols} />
        </section>
      </div>
    </AppShell>
  );
}
