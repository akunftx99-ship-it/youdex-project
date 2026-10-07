"use client";

import { useArcSwap } from "@/hooks/use-arc-swap";
import { useArcBalances } from "@/hooks/use-arc-balances";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { ArcSwap } from "@/lib/arc-swaps";
import { formatArcPrice, formatUsd, unformatArcPrice } from "@/components/app/arc-market-table";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Recent swaps — 220px rail. Real fills for the selected ARC pair, polled from
   the /api/swaps proxy (which reads the same feed as peach.ag's ARC terminal)
   and rendered newest-first.
--------------------------------------------------------------------------- */

const MAX_ROWS = 25;
const POLL_MS = 5000;

/* ---------------------------------------------------------------------------
   Order types for the entry panel. Market leads because it is the default and
   the one a trader can place without picking a price.
--------------------------------------------------------------------------- */

type OrderType = "market" | "limit";

const ORDER_TYPES: { key: OrderType; label: string; hint: string }[] = [
  { key: "market", label: "Market Order", hint: "Fill now at the best available price" },
  { key: "limit", label: "Limit Order", hint: "Only fill at your price or better" },
];

type SwapsResponse = { swaps: ArcSwap[]; error?: string };

/** Union of the tape we already hold and the newest poll, newest first. */
function mergeSwaps(current: ArcSwap[], incoming: ArcSwap[]) {
  const byId = new Map<string, ArcSwap>();
  for (const row of current) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_ROWS);
}

/**
 * The tape previously formatted tiny fills with toPrecision(6), which read as
 * "4.06400e-5" for a 0.00004 fill. Delegate to the shared formatter so swaps
 * carry the same subscript notation as the tables: 0.00004064 -> 0.0₃4064.
 */
function fmtPrice(v: number): string {
  return formatArcPrice(v);
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
          <span className="w-[60px] shrink-0 text-right">Value</span>
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
                <span className="w-[60px] shrink-0 truncate text-right tabular-nums text-foreground/80">
                  {formatUsd(row.valueUsd)}
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
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 36px tall box, 13px tall input — clicking the label or the padding around
   * the number hit nothing and the field felt dead ("cannot type in it"). Now
   * the whole box is a click target: pointer events focus the input directly,
   * the label is bound with htmlFor, and the input itself is tall enough to
   * carry a real caret.
   */
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      <div
        className="home-glass flex h-11 min-w-0 flex-1 cursor-text items-center rounded-lg px-1"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) inputRef.current?.focus();
        }}
      >
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(stepValue(value, -1))}
          className="mr-0.5 grid h-7 w-5 shrink-0 place-items-center text-[11px] text-muted-foreground transition-transform active:scale-95"
        >
          −
        </button>
        <div className="min-w-0 flex-1 px-0.5 text-center">
          <label htmlFor={id} className="block cursor-text truncate text-[8px] leading-tight text-muted-foreground">
            {label}
          </label>
          <input
            id={id}
            ref={inputRef}
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="h-6 w-full min-w-0 cursor-text rounded bg-transparent text-center font-mono text-[13px] leading-none tabular-nums outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(stepValue(value, 1))}
          className="ml-0.5 grid h-7 w-5 shrink-0 place-items-center text-[11px] text-muted-foreground transition-transform active:scale-95"
        >
          +
        </button>
      </div>
      {unit ? (
        <button
          type="button"
          onClick={onUnit}
          className="home-glass inline-flex h-11 w-[3.75rem] shrink-0 items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold"
        >
          <span className="max-w-[2.25rem] truncate">{unit}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Nudge for the +/- steppers. They used to call onChange("") — both buttons just
 * wiped the field, so the column read as dead. Step by 10% of the current value
 * with a floor of 1 unit, so a nudge always visibly moves the number.
 */
function stepValue(current: string, direction: 1 | -1): string {
  const n = Number(current) || 0;
  const step = n > 0 ? Math.max(1, n * 0.1) : 1;
  const next = direction > 0 ? (n || 0) + step : n - step;
  if (next <= 0) return "";
  return Number(next.toFixed(8)).toString();
}

export function OrderEntry({
  base = "—",
  quote = "USDC",
  price,
  onPrice,
  onBbo,
  tokenAddress,
  pairAddress,
  quoteAddress = "0x3600000000000000000000000000000000000000",
  createdAtMs,
}: {
  base?: string;
  quote?: string;
  price: string;
  onPrice: (v: string) => void;
  /** Refill the price field from the live market. */
  onBbo?: () => void;
  /** Base token contract — the side that gets bought or sold. */
  tokenAddress?: string;
  /** Pool address (20-byte) or v4 pool id (32-byte) to route against. */
  pairAddress?: string;
  /** Quote token contract; USDC on Arc by default. */
  quoteAddress?: string;
  /** Token launch time (ms) — speeds up hooked-pool resolution server-side. */
  createdAtMs?: number;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  /** Market is the default: it is the order you can place without deciding a price. */
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [typeOpen, setTypeOpen] = useState(false);
  const typeBoxRef = useRef<HTMLDivElement | null>(null);
  const [qty, setQty] = useState("");
  const [pct, setPct] = useState(0);
  const totalId = useId();
  /** Non-empty while the trader is typing in Total directly; cleared whenever a
   *  quantity is set elsewhere so the field falls back to the derived value. */
  const [totalText, setTotalText] = useState("");
  const { swap, phase, reset, hasWallet } = useArcSwap();

  /**
   * Market spends the sold side; a limit order offers the maker side for the
   * taking side. Both derive from the same price x qty math.
   */
  const onSubmit = async () => {
    if (!tokenAddress || !pairAddress || !qty || !(Number(total) > 0)) return;

    const amount = side === "buy" ? String(total) : qty;
    await swap({
      pairAddress,
      tokenIn: direction().tokenIn,
      tokenOut: direction().tokenOut,
      amountIn: amount,
      createdAtMs,
    });
    // a fill moves both balances; the Avbl line should follow it
    refreshBalances();
  };

  /** Buy spends quote, sell spends base. */
  const direction = () =>
    side === "buy"
      ? { tokenIn: quoteAddress as `0x${string}`, tokenOut: tokenAddress as `0x${string}` }
      : { tokenIn: tokenAddress as `0x${string}`, tokenOut: quoteAddress as `0x${string}` };

  const busy = ["quoting", "approving", "awaiting-approval", "swapping", "pending"]
    .includes(phase.kind);

  /** Real wallet balances — the Avbl line and the percent buttons size against
   *  these. Both used to be decorative. */
  const { balances, refresh: refreshBalances } = useArcBalances([tokenAddress, quoteAddress]);
  const priceNum = unformatArcPrice(price);

  /** Buying spends the quote token, selling spends the base token. */
  const availableRaw = side === "buy" ? balances[quoteAddress] : tokenAddress ? balances[tokenAddress] : undefined;
  const available = availableRaw ? Number(availableRaw.raw) / 10 ** availableRaw.decimals : 0;

  /** Percent buttons write a real quantity: for a buy that is
   *  (balance x pct) / price, for a sell it is just balance x pct. */
  const applyPct = (p: number) => {
    setPct(p);
    if (p <= 0 || !(available > 0)) return;
    if (side === "buy") {
      if (!(priceNum > 0)) return;
      const spend = (available * p) / 100;
      updateQty(Number((spend / priceNum).toPrecision(8)).toString());
    } else {
      updateQty(Number(((available * p) / 100).toPrecision(8)).toString());
    }
  };

  /** Any quantity edit invalidates a hand-typed Total, so the two stay in sync. */
  const updateQty = (v: string) => {
    setQty(v);
    setTotalText("");
  };

  /** Typing a Total (in the quote token) solves for the quantity instead. */
  const onTotalChange = (v: string) => {
    setTotalText(v);
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setQty("");
      return;
    }
    if (priceNum > 0) setQty(Number((n / priceNum).toPrecision(8)).toString());
  };

  const isMarket = orderType === "market";
  const activeType = ORDER_TYPES.find((t) => t.key === orderType) ?? ORDER_TYPES[0];

  /** Click outside closes the order-type menu. */
  useEffect(() => {
    if (!typeOpen) return;
    const onClick = (event: MouseEvent) => {
      if (typeBoxRef.current && !typeBoxRef.current.contains(event.target as Node)) {
        setTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [typeOpen]);

  /**
   * A market order executes at whatever the book offers, so a stale manual
   * price would be a lie — selecting it snaps the field back to the live market.
   */
  const chooseType = (next: OrderType) => {
    setOrderType(next);
    setTypeOpen(false);
    if (next === "market") onBbo?.();
  };

  // Plain arithmetic, not useMemo: memoizing two conversions made the React
  // Compiler skip the whole component, which costs more than it saves.
  // unformatArcPrice, not Number(): the field holds a display string like
  // "0.0₃4064" for tiny tokens, which Number() reads as NaN — that used to keep
  // Buy/Sell disabled forever on most Arc pairs.
  const total = unformatArcPrice(price) * (Number(qty) || 0);

  /**
   * The button is ready as soon as the order is worth anything. The old $5
   * floor was a template rule we do not use, and its "Minimum trade" caption
   * went with it — a disabled button with no visible reason is worse than
   * letting the trader submit and be told by the venue.
   */
  const disabled = !(total > 0);

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

        {/* Order type — opens a menu of order types */}
        <div ref={typeBoxRef} className="relative">
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={typeOpen}
            aria-label={`Order type: ${activeType.label}`}
            className="home-glass flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            {activeType.label}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", typeOpen && "rotate-180")}
            />
          </button>

          {typeOpen ? (
            <div
              role="listbox"
              aria-label="Order type"
              /*
               * position comes from the inline style, not a Tailwind class:
               * `.home-glass { position: relative }` in globals.css outranks
               * `.absolute`, which would drop the menu into the flow and shove
               * the price field down instead of overlaying it.
               */
              style={{ position: "absolute" }}
              className="home-glass left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg"
            >
              {ORDER_TYPES.map((type) => {
                const active = type.key === orderType;
                return (
                  <button
                    key={type.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => chooseType(type.key)}
                    className={cn(
                      "flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors",
                      active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[11px] font-semibold",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {type.label}
                      </span>
                      <span className="mt-0.5 block text-[9px] leading-tight text-muted-foreground/75">
                        {type.hint}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        "mt-0.5 h-3 w-3 shrink-0 text-primary",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Price + BBO. A market order takes the book's price, so the field
            shows the live market read-only instead of pretending it is yours. */}
        <div className="flex min-w-0 flex-1 gap-1">
          <div
            className={cn(
              "home-glass flex h-11 min-w-0 flex-1 items-center rounded-lg px-1",
              isMarket && "opacity-70",
            )}
          >
            <button
              type="button"
              aria-label={`Decrease Price (${quote})`}
              disabled={isMarket}
              onClick={() => onPrice("")}
              className="mr-0.5 grid h-6 w-4 shrink-0 place-items-center text-[10px] text-muted-foreground transition-transform active:scale-95 disabled:opacity-30"
            >
              −
            </button>
            <div className="min-w-0 flex-1 px-0.5 text-center">
              <p className="truncate text-[8px] leading-tight text-muted-foreground">
                {isMarket ? `Market Price (${quote})` : `Price (${quote})`}
              </p>
              <div className="flex h-6 items-center justify-center">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  readOnly={isMarket}
                  onChange={(e) => onPrice(e.target.value)}
                  aria-label={isMarket ? "Market price (read only)" : `Price (${quote})`}
                  className="trading-num-input h-6 w-full bg-transparent text-center font-mono text-[13px] leading-none tabular-nums outline-none read-only:cursor-default"
                />
              </div>
            </div>
            <button
              type="button"
              aria-label={`Increase Price (${quote})`}
              disabled={isMarket}
              onClick={() => onPrice("")}
              className="ml-0.5 grid h-6 w-4 shrink-0 place-items-center text-[10px] text-muted-foreground transition-transform active:scale-95 disabled:opacity-30"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={onBbo}
            disabled={isMarket}
            title={isMarket ? "Market orders always take the live price" : "Use the live best bid/offer"}
            className="home-glass h-9 w-9 shrink-0 rounded-lg text-[9px] font-semibold transition-colors disabled:opacity-40"
          >
            BBO
          </button>
        </div>

        {/* Quantity + unit */}
        <div className="space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Stepper label="Quantity" value={qty} onChange={updateQty} unit={base} />
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
            onChange={(e) => applyPct(Number(e.target.value))}
            aria-label="Order size percent"
            className="w-full accent-[#00ff1e]"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {[0, 25, 50, 75, 100].map((p) => (
              <button key={p} type="button" onClick={() => applyPct(p)} className="tabular-nums hover:text-foreground">
                {p}%
              </button>
            ))}
          </div>
        </div>

        {/* Total — editable. Typing a USD value back-solves the quantity, so the
            order can be sized either way round (amount or value). */}
        <div className="space-y-1.5">
          <div className="home-glass flex h-11 min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 text-[11px]">
            <label htmlFor={totalId} className="shrink-0 cursor-text text-muted-foreground">
              Total
            </label>
            <input
              id={totalId}
              inputMode="decimal"
              placeholder="0.00"
              value={totalText !== "" ? totalText : qty !== "" && total > 0 ? total.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""}
              onChange={(e) => onTotalChange(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="h-6 min-w-0 flex-1 cursor-text rounded bg-transparent text-right font-mono text-[13px] tabular-nums outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            />
            <span className="shrink-0 text-muted-foreground">{quote}</span>
          </div>
          <div className="flex min-w-0 justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">Avbl</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono tabular-nums">
                {available > 0
                  ? `${available.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${side === "buy" ? quote : base}`
                  : `— ${side === "buy" ? quote : base}`}
              </span>
              {available > 0 ? (
                <button type="button" onClick={() => applyPct(100)} className="shrink-0 text-[10px] font-semibold text-primary hover:underline">
                  MAX
                </button>
              ) : null}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={disabled || busy || !tokenAddress || !pairAddress}
          onClick={onSubmit}
          className={cn(
            "h-9 w-full rounded-md text-xs font-semibold disabled:opacity-60",
            side === "buy"
              ? "bg-success text-success-foreground"
              : "bg-danger text-danger-foreground",
          )}
        >
          {busy ? busyLabel(phase) : `${side === "buy" ? "Buy" : "Sell"} ${base}`}
        </button>

        {/* Swap status — the wallet flow is multi-step, so it is always visible. */}
        {phase.kind === "error" ? (
          <div className="flex items-start justify-between gap-2 rounded-lg bg-danger/10 px-2.5 py-2 text-[10px] text-danger">
            <span className="min-w-0 break-words">{phase.message}</span>
            <button type="button" onClick={reset} className="shrink-0 underline">dismiss</button>
          </div>
        ) : null}
        {phase.kind === "awaiting-approval" || phase.kind === "pending" ? (
          <a
            href={`https://explorer.arc.io/tx/${phase.hash}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate rounded-lg bg-white/5 px-2.5 py-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            {phase.kind === "awaiting-approval" ? "Approval sent" : "Swap sent"}: {phase.hash?.slice(0, 18)}…
          </a>
        ) : null}
        {phase.kind === "done" && phase.hash ? (
          <a
            href={`https://explorer.arc.io/tx/${phase.hash}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate rounded-lg bg-success/10 px-2.5 py-2 text-[10px] text-success hover:underline"
          >
            Swapped ✓ {phase.hash.slice(0, 18)}…{phase.amountOut ? ` (out ${phase.amountOut})` : ""}
          </a>
        ) : null}
        {/* No wallet yet is a normal state, not an error — say so up front. */}
        {!hasWallet && !busy && phase.kind !== "error" ? (
          <p className="text-center text-[10px] text-muted-foreground">
            Log in to enable on-chain swaps
          </p>
        ) : null}
      </div>
    </div>
  );
}

function busyLabel(phase: { kind: string }): string {
  switch (phase.kind) {
    case "quoting": return "Getting quote…";
    case "approving": return "Approving…";
    case "awaiting-approval": return "Waiting for approval…";
    case "swapping": return "Confirm in wallet…";
    case "pending": return "Swapping…";
    default: return "Working…";
  }
}
