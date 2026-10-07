"use client";

/**
 * The v4 escape hatch: hand the execution to the 1inch Terminal.
 *
 * Arc's UniversalRouter reverts direct swaps (verified with full allowances),
 * and 1inch's calldata API needs a key for us to rebuild their flow — but the
 * Terminal itself is a public, working web app that already knows how to
 * aggregate this exact chain. This card deep-links the current pair into it,
 * so the trader gets a real 1inch execution without us maintaining a fragile
 * integration. The wallet connects inside the Terminal (its own connect flow).
 */
import { ExternalLink, Zap } from "lucide-react";

export function OneInchTerminalCard({
  baseAddress,
  baseSymbol,
  quoteAddress = "0x3600000000000000000000000000000000000000",
  quoteSymbol = "USDC",
}: {
  baseAddress?: string;
  baseSymbol: string;
  quoteAddress?: string;
  quoteSymbol?: string;
}) {
  const href = baseAddress
    ? `https://1inch.com/terminal?mode=market&pair=5042:${baseAddress}-${quoteAddress}`
    : "https://1inch.com/terminal";

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg bg-white/[0.04] p-3">
        <div className="flex items-start gap-2">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f15833]" />
          <div className="space-y-1">
            <p className="text-[11px] font-semibold leading-tight">Swap via 1inch Terminal</p>
            <p className="text-[10px] leading-snug text-muted-foreground">
              1inch aggregates all Arc liquidity (v3, v4, hooks) and supports limit
              orders — the pool executes on their router, not Arc&apos;s custom one.
            </p>
          </div>
        </div>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#f15833] text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Trade {baseSymbol}/{quoteSymbol} on 1inch
      </a>
      <p className="text-center text-[9px] leading-snug text-muted-foreground">
        Opens in a new tab — connect your wallet there to execute.
      </p>
    </div>
  );
}