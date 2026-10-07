/**
 * Live market numbers for the ARC catalog.
 *
 * `src/lib/arc-data.ts` is a frozen DexScreener snapshot: it carries the token
 * identities (symbol, name, addresses, DEX links) but every number in it was
 * true only on the day it was captured. This module pulls the same figures from
 * Peach's ARC feed so the UI can overlay live values on that static catalog.
 *
 * Source: POST https://api.peach.ag/arc/v1/arc/pro/v2/coins  { "ids": [addr, …] }
 */

import { ARC_EVERY, type ArcToken } from "@/lib/arc-data";
import { peachJson } from "@/lib/arc-upstream";

/** Numbers the market UI needs, keyed by lowercase token address. */
export type ArcLiveStats = {
  price: number;
  /** Percent change per window, matching the shape in arc-data.ts. */
  change: { m5: number; h1: number; h6: number; h24: number };
  /** Traded volume per window, in USD. */
  volume: { m5: number; h1: number; h6: number; h24: number };
  liquidity: number;
  marketCap: number;
  txns24: { buys: number; sells: number };
  /** Token logo the feed reports as visible, when it has one. */
  logo: string | null;
};

const COINS = "https://api.peach.ag/arc/v1/arc/pro/v2/coins";

/** The proxy answers 402 on oversized batches, so ids go out in chunks. */
const CHUNK = 50;

/** Upstream window tags -> the keys arc-data.ts already uses. */
const WINDOWS = { "5m": "m5", "1h": "h1", "4h": "h6", "24h": "h24" } as const;

type RawCoin = {
  address?: string;
  p?: string | number;
  ch24h?: string | number;
  liqUsd?: string | number;
  mcap?: string | number;
  v24h?: string | number;
  logoURI?: string;
  logo_status?: string;
  states?: {
    tp?: string;
    /** Window price change as a fraction, e.g. 0.004077 = +0.41%. */
    pc?: number;
    /** Window volume in USD. */
    vu?: string | number;
    /** Buy / sell counts for the window. */
    nb?: string | number;
    ns?: string | number;
  }[];
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function toStats(raw: RawCoin): ArcLiveStats | null {
  const address = typeof raw.address === "string" ? raw.address.toLowerCase() : "";
  const price = num(raw.p);
  if (!address || price <= 0) return null;

  const change = { m5: 0, h1: 0, h6: 0, h24: num(raw.ch24h) * 100 };
  const volume = { m5: 0, h1: 0, h6: 0, h24: num(raw.v24h) };
  const txns24 = { buys: 0, sells: 0 };

  for (const state of raw.states ?? []) {
    const key = WINDOWS[state.tp as keyof typeof WINDOWS];
    if (key) {
      change[key] = num(state.pc) * 100;
      volume[key] = num(state.vu);
    }
    if (state.tp === "24h") {
      txns24.buys = num(state.nb);
      txns24.sells = num(state.ns);
    }
  }

  const logo = typeof raw.logoURI === "string" && raw.logoURI.startsWith("http") && raw.logo_status !== "hidden" ? raw.logoURI : null;
  return { price, change, volume, liquidity: num(raw.liqUsd), marketCap: num(raw.mcap), txns24, logo };
}

/** Live stats for the given addresses. Chunks that fail are simply absent. */
export async function fetchArcStats(addresses: string[]): Promise<Record<string, ArcLiveStats>> {
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += CHUNK) chunks.push(addresses.slice(i, i + CHUNK));

  const batches = await Promise.all(
    chunks.map(async (ids) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const parsed = await peachJson<{ data?: { coin_list?: RawCoin[] } }>(COINS, {
            method: "POST",
            body: { ids },
          });
          return parsed?.data?.coin_list ?? [];
        } catch {
          // transient — retry once, then let this chunk go missing
        }
      }
      return [] as RawCoin[];
    }),
  );

  const out: Record<string, ArcLiveStats> = {};
  for (const raw of batches.flat()) {
    const stats = toStats(raw);
    if (stats) out[raw.address!.toLowerCase()] = stats;
  }
  return out;
}

/** Every catalog address, deduped — the set /api/prices polls. */
export function catalogAddresses(): string[] {
  return [...new Set(ARC_EVERY.map((token: ArcToken) => token.address.toLowerCase()))];
}
