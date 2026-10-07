"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Clock,
  Eye,
  EyeOff,
  Send,
  TrendingUp,
} from "lucide-react";
import { useWallets } from "@privy-io/react-auth";
import { AppShell } from "@/components/app/app-shell";
import { TokenAvatar } from "@/components/app/token-avatar";
import { formatPortfolioAmount, formatUsd } from "@/lib/arc-portfolio";
import { useArcPortfolio } from "@/hooks/use-arc-portfolio";
import { cn } from "@/lib/utils";

/** Read-only portfolio preview: /fund?address=0x… (no wallet needed). */
function subscribePreview() { return () => {}; }
function readPreview(): string | undefined {
  const q = new URLSearchParams(window.location.search).get("address");
  return q && /^0x[0-9a-fA-F]{40}$/.test(q) ? q : undefined;
}

export default function FundPage() {
  const [hidden, setHidden] = useState(false);
  const [range, setRange] = useState("7D");
  const [tab, setTab] = useState<"assets" | "history">("assets");

  // Holdings come straight off Arc's RPC (one batched Multicall3 sweep), keyed
  // by the connected wallet — no hardcoded numbers, no indexer in the path.
  // ?address=0x… previews any wallet read-only (handy for sharing a portfolio).
  const { wallets } = useWallets();
  const connected = wallets.find((w) => w.walletClientType === "privy")?.address ?? wallets[0]?.address;
  const preview = useSyncExternalStore(subscribePreview, readPreview, () => undefined);
  const address = preview ?? connected;
  const { data, loading, error } = useArcPortfolio(address);

  const usdc = data?.usdcBalance ?? "0";
  const totalUsd = data?.totalUsd ?? 0;
  const rows = useMemo(() => data?.items ?? [], [data]);
  const status = !address
    ? "connect a wallet to read balances"
    : error
      ? `read failed — ${error}`
      : loading && !data
        ? "reading balances…"
        : `${rows.length} asset${rows.length === 1 ? "" : "s"} on ARC`;

  return (
    <AppShell current="/fund" title="Fund">
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* ---- Summary ---- */}
        <section className="home-glass rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Estimated Total Value
                </p>
                <button
                  type="button"
                  onClick={() => setHidden((v) => !v)}
                  aria-label={hidden ? "Show balance" : "Hide balance"}
                  className="grid h-5 w-5 place-items-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-heading text-4xl font-bold tracking-tight text-foreground">
                  {hidden ? "••••••" : formatPortfolioAmount(usdc)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">USDC</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                ≈ {hidden ? "$•••" : formatUsd(totalUsd)} · {status}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Today&apos;s PNL</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  <TrendingUp className="h-3 w-3" />
                  +0.00$ (+0.00%)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/fund"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_16px_rgba(74,222,128,0.25)] transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                <ArrowDownToLine className="h-4 w-4" />
                Deposit
              </Link>
              <span
                role="button"
                aria-disabled="true"
                title="Coming soon"
                className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-medium text-muted-foreground opacity-60"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Transfer
              </span>
              <span
                role="button"
                aria-disabled="true"
                title="Coming soon"
                className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-medium text-muted-foreground opacity-60"
              >
                <Send className="h-4 w-4" />
                Send
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Spot
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                {hidden ? "••••" : formatPortfolioAmount(usdc)}{" "}
                <span className="text-xs font-medium text-muted-foreground">USDC</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Spot equity</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Futures
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                0.00 <span className="text-xs font-medium text-muted-foreground">USDC</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Futures equity · locked</p>
            </div>
          </div>
        </section>

        {/* ---- PNL panel ---- */}
        <section className="home-glass rounded-2xl p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Spot 100%
            </span>
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {["7D", "30D", "90D"].map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setRange(entry)}
                  className={cn(
                    "h-7 rounded-full px-3 text-[11px] font-semibold transition-colors",
                    range === entry
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="relative grid h-[200px] place-items-center rounded-xl border border-white/[0.07] bg-[#0b0f14]">
            <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {[40, 90, 140].map((y) => (
                <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="rgba(255,255,255,0.05)" />
              ))}
              <line x1="0" y1="150" x2="800" y2="150" stroke="#00ff1e" strokeWidth="2" />
            </svg>
            <p className="relative text-xs text-muted-foreground">
              No trade activity in {range}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between font-mono text-xs">
            <span className="text-primary">+$0.00 / {range}</span>
            <span className="text-muted-foreground">PNL</span>
          </div>
        </section>

        {/* ---- Assets / History ---- */}
        <section className="home-glass rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {(["assets", "history"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setTab(entry)}
                  className={cn(
                    "border-b-2 pb-1 text-xs font-semibold capitalize transition-colors",
                    tab === entry
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry}
                </button>
              ))}
            </div>
            <span
              role="link"
              aria-disabled="true"
              title="Coming soon"
              className="inline-flex cursor-not-allowed items-center gap-1.5 text-xs font-medium text-muted-foreground opacity-60"
            >
              <Clock className="h-3.5 w-3.5" />
              History
            </span>
          </div>

          {tab === "assets" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-widest text-[#4a5568]">
                    <th className="py-3 text-left font-semibold">Asset</th>
                    <th className="py-3 text-right font-semibold">Amount</th>
                    <th className="py-3 text-right font-semibold">Value</th>
                    <th className="py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!address ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        Connect a wallet to see your ARC holdings.
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        {error ? `Could not read balances — ${error}` : loading ? "Reading balances…" : "No ARC tokens in this wallet yet."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item) => (
                      <tr key={item.address} className="border-b border-white/[0.04]">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <TokenAvatar symbol={item.symbol} address={item.address} image={item.image} size={32} />
                            <div>
                              <p className="font-semibold text-foreground">{item.symbol}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {item.symbol === "USDC" ? "Spot wallet" : item.name}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-sm text-foreground">
                          {hidden ? "••••" : formatPortfolioAmount(item.balance)}
                        </td>
                        <td className="py-3 text-right font-mono text-sm text-foreground">
                          {hidden ? "$•••" : formatUsd(item.valueUsd)}
                        </td>
                        <td className="py-3 text-right">
                          {item.symbol === "USDC" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Link
                              href="/trade"
                              className="inline-flex h-7 items-center rounded-lg border border-white/12 px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              Trade
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No transactions yet.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
