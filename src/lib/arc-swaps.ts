/**
 * Recent-swap feed for the spot terminal.
 *
 * Source: Peach's ARC terminal (https://www.peach.ag/arc/tokens/<address>),
 * which reads CoinMarketCap's DEX feed through its own `/v1/proxy/...` host.
 * That host is not callable from the browser (CORS), so requests go through
 * the /api/swaps route instead and only the fields the tape renders survive.
 */

import { peachJsonRetry } from "@/lib/arc-upstream";

export type ArcSwap = {
  /** Stable key — the log id is unique per fill inside a transaction. */
  id: string;
  side: "buy" | "sell";
  /** Fill price in USD, already computed upstream. */
  price: number;
  /** Base-token amount the fill moved. */
  baseAmount: number;
  /** Quote-token amount the fill moved. */
  quoteAmount: number;
  /** Fill size in USD. */
  valueUsd: number;
  /** Fill time, epoch milliseconds. */
  at: number;
  /** Venue that settled the fill, e.g. "Uniswap V3 (Arc)". */
  dex: string;
  tx: string;
};

const SOURCE = "https://api.peach.ag/v1/proxy/coinmarketcap/v1/dex/tokens/transactions";

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Upstream rows are loosely typed and occasionally malformed — drop those. */
function toSwap(raw: unknown): ArcSwap | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const tx = typeof row.tx === "string" ? row.tx : "";
  const at = num(row.ts);
  const price = num(row.q);
  const baseAmount = num(row.a0);
  if (!tx || at === null || price === null || baseAmount === null) return null;

  const quoteAmount = num(row.a1) ?? 0;
  return {
    id: `${tx}:${typeof row.lgid === "string" || typeof row.lgid === "number" ? row.lgid : "0"}`,
    side: row.tp === "sell" ? "sell" : "buy",
    price,
    baseAmount,
    quoteAmount,
    valueUsd: num(row.v) ?? quoteAmount,
    at,
    dex: typeof row.en === "string" ? row.en : "",
    tx,
  };
}

export async function fetchArcSwaps(
  address: string,
  limit: number,
): Promise<{ swaps: ArcSwap[]; error?: string }> {
  const url = `${SOURCE}?platform=arc&address=${encodeURIComponent(address)}&limit=${limit}`;
  try {
    const parsed = await peachJsonRetry<{ data?: { swaps?: unknown[] } }>(url);
    const raw = Array.isArray(parsed?.data?.swaps) ? parsed.data.swaps : [];
    return { swaps: raw.map(toSwap).filter((row): row is ArcSwap => row !== null) };
  } catch (error) {
    return { swaps: [], error: error instanceof Error ? error.message : "upstream request failed" };
  }
}
