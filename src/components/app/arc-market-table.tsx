"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArcToken } from "@/lib/arc-data";
import { arcPriceSeries } from "@/lib/arc-chart";
import { TokenAvatar } from "@/components/app/token-avatar";

/* ---------------------------------------------------------------------------
   Formatting helpers
--------------------------------------------------------------------------- */

/** U+2080–U+2089 — for collapsing long runs of leading zeros in tiny prices. */
const SUBSCRIPT = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

/** 12 -> "₁₂", 3 -> "₃" (multi-digit handled so 1e-12 prices still parse). */
function toSubscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
}

/**
 * Inverse of formatArcPrice for the order form's total.
 *
 * The price field carries a *display* string, and for tiny tokens that is
 * "0.0₃4064" — which Number() turns into NaN, so every total came out 0 and the
 * Buy/Sell button stayed disabled on exactly the tokens this app is full of.
 * Expanding the subscript back to real zeros fixes the arithmetic.
 */
export function unformatArcPrice(text: string): number {
  const t = text.replace(/,/g, "").trim();
  if (!t) return 0;
  const sub = t.match(/^0\.0([₀₁₂₃₄₅₆₇₈₉]+)(\d*)$/);
  if (sub) {
    const digits = sub[1].split("").reduce((acc, ch) => acc * 10 + SUBSCRIPT.indexOf(ch), 0);
    // formatArcPrice writes "0." + literal 0 + subscript(zeros - 1) + sig
    const zeros = digits + 1;
    const parsed = Number(`0.${"0".repeat(zeros)}${sub[2] ?? ""}`);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function formatArcPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  if (value >= 1000) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(6);

  // Tiny price. 0.00004064 renders as "0.0₃4064": the literal "0" plus the
  // subscript "3" stand for the four leading zeros, then 4064 are the first
  // significant digits. Readable at a glance in a table row where ten zeros
  // would eat the whole cell. Anything from two leading zeros on (0.002,
  // 0.00045) gets the treatment; one zero (0.013556) stays a plain decimal.
  const places = value.toFixed(20).replace(/0+$/, "");
  const dot = places.indexOf(".");
  if (dot >= 0) {
    const frac = places.slice(dot + 1);
    let zeros = 0;
    while (zeros < frac.length && frac[zeros] === "0") zeros++;
    if (zeros >= 2) {
      const sig = (frac.slice(zeros).replace(/0+$/, "") || "0").slice(0, 4);
      return `0.0${toSubscript(zeros - 1)}${sig}`;
    }
  }
  return value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/* ---------------------------------------------------------------------------
   Token mark — real DexScreener logo when available, mono initials otherwise
--------------------------------------------------------------------------- */

export function ArcTokenMark({ token, size = 28 }: { token: ArcToken; size?: number }) {
  // Real DexScreener logo when one exists, otherwise a generated gradient badge
  // keyed on the token address — DexScreener has no imagery for most ARC tokens.
  return (
    <TokenAvatar
      symbol={token.symbol}
      address={token.address}
      image={token.image}
      size={size}
    />
  );
}

/* ---------------------------------------------------------------------------
   Sparkline — reconstructed from the API's reported change across timeframes
   (m5 → h1 → h6 → h24). Not tick data: the shape is derived from real values.
--------------------------------------------------------------------------- */

export function ArcSparkline({ token, width = 76, height = 24 }: { token: ArcToken; width?: number; height?: number }) {
  // Same reconstruction the candlestick pane uses, so an up token can never
  // draw a down line: the series is anchored on the reported m5/h1/h6/h24
  // changes and always ends at the current price.
  const series = arcPriceSeries(token, 24);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points = series.map((v, i) => {
    const x = (i / (series.length - 1)) * width;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const flat = Math.abs(token.change.h24) < 0.005;
  const up = token.change.h24 > 0;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={flat ? "var(--muted-foreground)" : up ? "var(--success)" : "var(--danger)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChangePill({ value }: { value: number }) {
  const flat = Math.abs(value) < 0.005;
  const up = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
        flat
          ? "border-white/10 bg-white/[0.04] text-muted-foreground"
          : up
            ? "border-success/30 bg-success/10 text-success"
            : "border-danger/30 bg-danger/10 text-danger",
      )}
    >
      {formatPct(value)}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          },
          () => undefined,
        );
      }}
      className="grid h-5 w-5 place-items-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Table
--------------------------------------------------------------------------- */

export function ArcMarketTable({
  tokens,
  showRank = true,
  hotSymbols,
  basePath = "/trade",
}: {
  tokens: ArcToken[];
  showRank?: boolean;
  /** Symbols to flag with a flame badge. */
  hotSymbols?: string[];
  /** Route prefix for the Trade action. */
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-widest text-[#4a5568]">
            {showRank ? <th className="w-10 py-3 text-left font-semibold">#</th> : null}
            <th className="py-3 text-left font-semibold">Pair</th>
            <th className="py-3 text-right font-semibold">Price</th>
            <th className="py-3 text-right font-semibold">24h Change</th>
            <th className="py-3 text-right font-semibold">24h Volume</th>
            <th className="py-3 text-right font-semibold">
              <span title="Circulating market cap reported by DexScreener; falls back to FDV when unset.">
                Market Cap
              </span>
            </th>
            <th className="py-3 text-center font-semibold">Chart</th>
            <th className="py-3 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, index) => {
            const isHot = hotSymbols?.includes(token.symbol);
            return (
              <tr
                key={token.pairAddress}
                role="link"
                tabIndex={0}
                aria-label={`Trade ${token.pair}`}
                onClick={() => router.push(`${basePath}?pair=${encodeURIComponent(token.pairAddress)}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`${basePath}?pair=${encodeURIComponent(token.pairAddress)}`);
                  }
                }}
                className="group/row cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
              >
                {showRank ? (
                  <td className="py-3 font-mono text-xs tabular-nums text-muted-foreground/70">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                ) : null}

                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <ArcTokenMark token={token} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-foreground">
                          {token.symbol}
                        </span>
                        {isHot ? (
                          <Flame className="h-3 w-3 shrink-0 text-danger" aria-label="hot" />
                        ) : null}
                        <CopyButton value={token.symbol} />
                      </div>
                      <span className="truncate text-[11px] text-muted-foreground">
                        /{token.quote} · {token.name}
                      </span>
                    </div>
                  </div>
                </td>

                <td className="py-3 text-right font-mono text-sm tabular-nums text-foreground">
                  {formatArcPrice(token.price)}
                </td>

                <td className="py-3 text-right">
                  <ChangePill value={token.change.h24} />
                </td>

                <td className="py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatUsd(token.volume.h24)}
                </td>

                <td className="py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatUsd(token.marketCap > 0 ? token.marketCap : token.fdv)}
                </td>

                <td className="py-3">
                  <div className="flex justify-center">
                    <ArcSparkline token={token} />
                  </div>
                </td>

                <td className="py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <a
                      href={`${basePath}?pair=${encodeURIComponent(token.pairAddress)}`}
                      className="inline-flex h-7 items-center rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-primary/20"
                    >
                      Trade
                    </a>
                    <a
                      href={token.dexUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${token.pair} on DexScreener`}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
