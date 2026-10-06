"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ArcSwap } from "@/lib/arc-swaps";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Recent swaps — 220px rail. Real fills for the selected ARC pair, polled from
   the /api/swaps proxy (which reads the same feed as peach.ag's ARC terminal)
   and rendered newest-first.
--------------------------------------------------------------------------- */

const MAX_ROWS = 25;
const POLL_MS = 5000;

type SwapsResponse = { swaps: ArcSwap[]; error?: string };

/** Union of the tape we already hold and the newest poll, newest first. */
function mergeSwaps(current: ArcSwap[], incoming: ArcSwap[]) {
  const byId = new Map<string, ArcSwap>();
  for (const row of current) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_ROWS);
}

function fmtPrice(v: number) {
  if (v >= 1000) {
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toPrecision(6);
}

function fmtSize(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}K`;
  if (v >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}

function fmtClock(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Fill age, tape style: "just now" then the coarsest unit that still reads. */
function fmtAge(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 15) return "just now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}hr`;
  return `${Math.floor(hours / 24)}d`;
}

export function RecentSwaps({
  address = "",
  base = "—",
  quote = "USDC",
}: {
  /** Token contract whose fills are shown; the chain is fixed upstream. */
  address?: string;
  base?: string;
  quote?: string;
}) {
  const [rows, setRows] = useState<ArcSwap[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [now, setNow] = useState(() => Date.now());

  // Ages drift even when no fill lands, so re-render them on their own clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // The caller remounts this component per pair, so one effect owns exactly one
  // instrument: poll until the pair changes, then tear the timer down.
  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/swaps?address=${address}&limit=${MAX_ROWS}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`swaps ${res.status}`);
        const body = (await res.json()) as SwapsResponse;
        if (stopped) return;
        setRows((prev) => mergeSwaps(prev, body.swaps));
        setStatus("live");
      } catch {
        if (!controller.signal.aborted) setStatus("offline");
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    timer = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [address]);

  const { buys, sells } = useMemo(() => {
    let b = 0;
    for (const row of rows) if (row.side === "buy") b++;
    return { buys: b, sells: rows.length - b };
  }, [rows]);
  const buyPct = rows.length ? Math.round((buys / rows.length) * 100) : 50;

  const badge =
    status === "live"
      ? { label: "Live", tone: "text-success", dot: "bg-success", pulse: "animate-pulse" }
      : status === "offline"
        ? { label: "Offline", tone: "text-danger", dot: "bg-danger", pulse: "" }
        : { label: "Syncing", tone: "text-muted-foreground", dot: "bg-muted-foreground", pulse: "" };

  return (
    <div className="home-glass flex w-[240px] shrink-0 flex-col rounded-2xl p-3">
      <div className="relative z-10 flex w-full max-w-full flex-1 flex-col overflow-hidden">
        <div className="mb-1 flex shrink-0 items-center justify-between border-b border-white/[0.06] pb-2 text-[12px] text-muted-foreground">
          <span>Recent Swaps</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
              badge.tone,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", badge.dot, badge.pulse)} />
            {badge.label}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span className="min-w-0 flex-1 truncate">Price ({quote})</span>
          <span className="w-[54px] shrink-0 text-right">Size</span>
          <span className="w-[58px] shrink-0 text-right">Age</span>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              {status === "offline" ? "Swap feed unavailable" : "Loading swaps…"}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                title={`${row.side === "buy" ? "Buy" : "Sell"} ${row.baseAmount.toLocaleString("en-US", {
                  maximumFractionDigits: 8,
                })} ${base} @ ${fmtPrice(row.price)} ${quote} · $${row.valueUsd.toFixed(2)} · ${row.dex} · ${fmtClock(row.at)}`}
                className="animate-swap-in flex min-h-[20px] shrink-0 items-center gap-1 font-mono text-[12px]"
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate tabular-nums",
                    row.side === "buy" ? "text-success" : "text-danger",
                  )}
                >
                  {fmtPrice(row.price)}
                </span>
                <span className="w-[54px] shrink-0 truncate text-right tabular-nums text-foreground/80">
                  {fmtSize(row.baseAmount)}
                </span>
                <span className="w-[58px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
                  {fmtAge(row.at, now)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-auto shrink-0 border-t border-white/[0.06] pt-2.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
            <span className="text-success">Buys {buys}</span>
            <span className="text-danger">Sells {sells}</span>
          </div>
          <div className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <span className="bg-success/70" style={{ width: `${buyPct}%` }} />
            <span className="bg-danger/70" style={{ width: `${100 - buyPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Order entry — 300px (xl 320px) rail.
--------------------------------------------------------------------------- */

function Stepper({
  label,
  value,
  onChange,
  unit,
  onUnit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  onUnit?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      <div className="home-glass flex h-9 min-w-0 flex-1 items-center rounded-lg px-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange("")}
          className="mr-0.5 grid h-6 w-4 shrink-0 place-items-center text-[10px] text-muted-foreground transition-transform active:scale-95"
        >
          −
        </button>
        <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden px-0.5 text-center">
          <p className="truncate text-[8px] leading-none text-muted-foreground">{label}</p>
          <div className="flex h-[13px] items-center justify-center overflow-hidden">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full bg-transparent text-center font-mono text-[10px] leading-none tabular-nums outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange("")}
          className="ml-0.5 grid h-6 w-4 shrink-0 place-items-center text-[10px] text-muted-foreground transition-transform active:scale-95"
        >
          +
        </button>
      </div>
      {unit ? (
        <button
          type="button"
          onClick={onUnit}
          className="home-glass inline-flex h-9 w-[3.75rem] shrink-0 items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold"
        >
          <span className="max-w-[2.25rem] truncate">{unit}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

export function OrderEntry({
  base = "—",
  quote = "USDC",
  price,
  onPrice,
  onBbo,
}: {
  base?: string;
  quote?: string;
  price: string;
  onPrice: (v: string) => void;
  /** Refill the price field from the live market. */
  onBbo?: () => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [pct, setPct] = useState(0);

  const total = useMemo(() => {
    const p = Number(price.replace(/,/g, "")) || 0;
    const q = Number(qty) || 0;
    return p * q;
  }, [price, qty]);

  const disabled = !(total >= 5);

  return (
    <div className="home-glass flex w-[300px] shrink-0 flex-col rounded-2xl p-4 xl:w-[320px]">
      <div className="relative z-10 min-w-0 space-y-2.5">
        {/* Buy / Sell segmented control */}
        <div className="home-glass relative flex rounded-lg p-0.5">
          {(["buy", "sell"] as const).map((s) => {
            const active = side === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={cn(
                  "relative z-10 h-8 flex-1 rounded-md text-[11px] font-bold capitalize transition-colors",
                  active
                    ? s === "buy"
                      ? "text-success-foreground"
                      : "text-danger-foreground"
                    : "text-muted-foreground",
                )}
              >
                {active ? (
                  <span
                    className={cn(
                      "absolute inset-0 z-[-1] rounded-md shadow-sm",
                      s === "buy" ? "bg-success" : "bg-danger",
                    )}
                  />
                ) : null}
                {s}
              </button>
            );
          })}
        </div>

        {/* Order type */}
        <button
          type="button"
          className="home-glass flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors"
        >
          Limit Order
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {/* Price + BBO */}
        <div className="flex min-w-0 flex-1 gap-1">
          <div className="home-glass flex h-9 min-w-0 flex-1 items-center rounded-lg px-1">
            <button
              type="button"
              aria-label={`Decrease Price (${quote})`}
              onClick={() => onPrice("")}
              className="mr-0.5 grid h-6 w-4 shrink-0 place-items-center text-[10px] text-muted-foreground transition-transform active:scale-95"
            >
              −
            </button>
            <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden px-0.5 text-center">
              <p className="truncate text-[8px] leading-none text-muted-foreground">
                Price ({quote})
              </p>
              <div className="flex h-[13px] items-center justify-center overflow-hidden">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => onPrice(e.target.value)}
                  className="trading-num-input w-full bg-transparent text-center font-mono text-[10px] leading-none tabular-nums outline-none"
                />
              </div>
            </div>
            <button
              type="button"
              aria-label={`Increase Price (${quote})`}
              onClick={() => onPrice("")}
              className="ml-0.5 grid h-6 w-4 shrink-0 place-items-center text-[10px] text-muted-foreground transition-transform active:scale-95"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={onBbo}
            title="Use the live best bid/offer"
            className="home-glass h-9 w-9 shrink-0 rounded-lg text-[9px] font-semibold transition-colors"
          >
            BBO
          </button>
        </div>

        {/* Quantity + unit */}
        <div className="space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Stepper label={`Quantity (${base})`} value={qty} onChange={setQty} unit={base} />
          </div>
          <p className="h-3.5 truncate text-right font-mono text-[10px] leading-3.5 text-muted-foreground tabular-nums">
            {qty ? `≈ ${total.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${quote}` : "\u00a0"}
          </p>
        </div>

        {/* Percent slider */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label="Order size percent"
            className="w-full accent-[#22d3ee]"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {[0, 25, 50, 75, 100].map((p) => (
              <button key={p} type="button" onClick={() => setPct(p)} className="tabular-nums">
                {p}%
              </button>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="space-y-1.5">
          <div className="home-glass flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 text-[11px]">
            <span className="shrink-0 text-muted-foreground">Total</span>
            <span className="truncate text-right font-mono tabular-nums">
              {total > 0 ? `${total.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${quote}` : `— ${quote}`}
            </span>
          </div>
          <div className="flex min-w-0 justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">Oil fee</span>
            <span className="truncate text-right font-mono tabular-nums">— / 50 Oil</span>
          </div>
          <div className="flex min-w-0 justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">Avbl</span>
            <span className="truncate text-right font-mono tabular-nums">100.00 {quote}</span>
          </div>
        </div>

        <p className={cn("h-3.5 text-[10px] leading-3.5 text-warning", total >= 5 && "invisible")}>
          Minimum trade is $5 {quote}
        </p>

        <button
          type="button"
          disabled={disabled}
          className={cn(
            "h-9 w-full rounded-md text-xs font-semibold disabled:opacity-60",
            side === "buy"
              ? "bg-success text-success-foreground"
              : "bg-danger text-danger-foreground",
          )}
        >
          {side === "buy" ? "Buy" : "Sell"} {base}
        </button>
      </div>
    </div>
  );
}
