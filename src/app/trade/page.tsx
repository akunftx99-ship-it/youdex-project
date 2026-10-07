"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, RotateCw, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ArcTokenMark, formatArcPrice, formatUsd } from "@/components/app/arc-market-table";
import { useTradeToken } from "@/hooks/use-trade-token";
import { CHART_INTERVALS, TradingChart, type ChartInterval } from "@/components/app/trading-chart";
import { OrderEntry, RecentSwaps } from "@/components/app/order-panels";
import { cn } from "@/lib/utils";

const TIMEFRAMES: ChartInterval[] = CHART_INTERVALS.map((i) => i.key);
const INDICATORS = ["MA", "EMA", "BOLL", "VOL", "MACD", "RSI"];

function SpotTerminal() {
  // Reactive: the market table pushes to this same route, so a mount-only read
  // would keep showing the previous token.
  const searchParams = useSearchParams();
  const pairParam = searchParams.get("pair");
  /**
   * A pair address the frozen catalog does not carry is hydrated from upstream,
   * so a freshly pasted contract opens a real terminal instead of silently
   * falling back to the first trending token.
   */
  const { token, origin, loading, unknown } = useTradeToken(pairParam);

  const [tf, setTf] = useState<ChartInterval>("15m");
  const [indicators, setIndicators] = useState<string[]>(["MA", "VOL"]);
  const [panelTab, setPanelTab] = useState<"holdings" | "orders">("holdings");

  /**
   * The order form tracks the market until the trader types in it. The override
   * is stored together with the pair it was typed for, so a live tick never
   * overwrites their entry and switching pair hands the field back to the
   * market — derived, no effect needed.
   */
  const [manual, setManual] = useState<{ pair: string; value: string } | null>(null);
  const price =
    manual && manual.pair === token.pair ? manual.value : formatArcPrice(token.price);

  const handlePrice = (value: string) => setManual({ pair: token.pair, value });
  const handleBbo = () => setManual(null);

  const toggleIndicator = (name: string) =>
    setIndicators((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );

  return (
    <AppShell current="/trade" title="Spot Trading">
      <div className="min-h-full w-full">
        {/* ---- Pair strip (52px on lg) ---- */}
        <div className="flex items-center justify-between gap-4 px-4 pt-3 lg:h-[52px] lg:border-b lg:border-white/[0.06] lg:px-5 lg:pt-0">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2.5">
              <ArcTokenMark token={token} size={26} />
              <span className="font-heading text-sm font-bold tracking-tight text-foreground">
                {token.pair}
              </span>
              <span
                role="button"
                aria-disabled="true"
                title="Coming soon"
                className="home-glass inline-flex cursor-not-allowed items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {token.dex}
                <ChevronDown className="h-3 w-3" />
              </span>
              {/*
                A pair hydrated from upstream is the case worth surfacing: the
                trader pasted a contract the catalog snapshot predates, so the
                badge says where the numbers came from instead of leaving them
                guessing.
              */}
              {loading ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  resolving pair…
                </span>
              ) : unknown ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-0.5 text-[10px] font-medium text-danger">
                  pair not found
                </span>
              ) : origin === "remote" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                  new pair · live
                </span>
              ) : null}
              <span
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums",
                  token.change.h24 >= 0 ? "text-success" : "text-danger",
                )}
              >
                {formatArcPrice(token.price)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold tabular-nums",
                  token.change.h24 >= 0 ? "text-success" : "text-danger",
                )}
              >
                {token.change.h24 >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {token.change.h24 >= 0 ? "+" : ""}
                {token.change.h24.toFixed(2)}%
              </span>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  24H Vol
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {formatUsd(token.volume.h24)}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Avbl
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  100.00 USDC
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Terminal row: chart | recent swaps | order entry, three even cards ---- */}
        <div className="pb-8">
          <div className="flex min-h-[640px] gap-3 border-b border-white/[0.06] p-3">
            {/* Chart */}
            <div className="home-glass flex min-w-0 flex-1 flex-col rounded-2xl p-3">
              <div className="relative z-10 mb-2 flex flex-wrap items-center gap-x-1 gap-y-1">
                {TIMEFRAMES.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setTf(entry)}
                    className={cn(
                      "h-6 rounded px-2 text-[10px] font-semibold transition-colors",
                      tf === entry ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {entry}
                  </button>
                ))}
              </div>

              <div className="relative z-10 h-[500px] w-full overflow-hidden rounded-xl border border-white/[0.07] bg-[#0b0f14] p-2">
                <TradingChart token={token} interval={tf} />
              </div>
              <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1">
                {INDICATORS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => toggleIndicator(entry)}
                    className={cn(
                      "h-6 rounded px-2 text-[10px] font-semibold transition-colors",
                      indicators.includes(entry)
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent swaps — 220px. Keyed per pair so the tape reloads on switch. */}
            <RecentSwaps
              key={token.pair}
              address={token.address}
              base={token.symbol}
              quote={token.quote}
            />

            {/* Order entry — 300px / xl 320px */}
            <OrderEntry
              base={token.symbol}
              quote={token.quote}
              price={price}
              onPrice={handlePrice}
              onBbo={handleBbo}
              tokenAddress={token.address}
              pairAddress={token.pairAddress}
            />
          </div>

          {/* ---- Holdings / Open orders ---- */}
          <div className="px-4 pb-4 pt-3">
            <div className="mb-3 flex items-center gap-4">
              {(
                [
                  { key: "holdings", label: "Holdings (0)" },
                  { key: "orders", label: "Open Orders (0)" },
                ] as const
              ).map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setPanelTab(entry.key)}
                  className={cn(
                    "border-b pb-1 text-xs font-semibold transition-colors",
                    panelTab === entry.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              ))}
              <button
                type="button"
                aria-label="Refresh"
                className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="py-6 text-center text-xs text-muted-foreground">
              {panelTab === "holdings" ? "No spot holdings" : "No open orders"}
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits
 * behind a Suspense boundary, and this page is exported statically.
 */
export default function SpotPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SpotTerminal />
    </Suspense>
  );
}
