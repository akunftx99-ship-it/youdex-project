"use client";

import { useEffect, useMemo, useState } from "react";
import { ARC_TRENDING, findArcToken, type ArcToken } from "@/lib/arc-data";
import { useArcLive } from "@/hooks/use-arc-live";

/**
 * Resolves the token a terminal URL points at.
 *
 * `arc-data.ts` is a frozen snapshot: a pair created after it was generated is
 * not in it, and `resolveArcToken()` silently falls back to TRE[0] — which made
 * a freshly pasted pair look like "the click does nothing", because /trade
 * quietly rendered a different token.
 *
 * This hook fixes that: a pair address the catalog does not know is hydrated
 * from the same upstream the search box uses (DexScreener identity + Peach
 * numbers via /api/search), so any pair is tradeable the moment it is pasted.
 */

export type TradeTokenState = {
  token: ArcToken;
  /** "catalog" is instant; "remote" was hydrated from upstream. */
  origin: "catalog" | "remote";
  /** True while a pair outside the catalog is still being fetched. */
  loading: boolean;
  /** Upstream had nothing for this address (or it is malformed). */
  unknown: boolean;
};

const ADDRESS = /^0x[0-9a-fA-F]{64}$|^0x[0-9a-fA-F]{40}$/;

/** Shape returned by /api/search. */
type SearchHit = {
  pairAddress: string;
  address: string;
  symbol: string;
  name: string;
  quote: string;
  pair: string;
  dex: string;
  image: string | null;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
};

/** Turn a search hit into a full ArcToken so every terminal panel can render it. */
function hitToToken(hit: SearchHit): ArcToken {
  const change24h = hit.change24h;
  return {
    symbol: hit.symbol,
    name: hit.name,
    quote: hit.quote || "USDC",
    pair: hit.pair || `${hit.symbol}/${hit.quote || "USDC"}`,
    address: hit.address,
    pairAddress: hit.pairAddress,
    dex: hit.dex || "arc",
    price: hit.price,
    // Only the 24h window is known from this source; the shorter windows stay 0
    // so nothing implies data that was not fetched.
    change: { m5: 0, h1: 0, h6: 0, h24: change24h },
    volume: { m5: 0, h1: 0, h6: 0, h24: hit.volume24h },
    liquidity: hit.liquidity,
    fdv: hit.marketCap,
    marketCap: hit.marketCap,
    txns24: { buys: 0, sells: 0 },
    createdAt: null,
    image: hit.image,
    dexUrl: hit.pairAddress,
  };
}

export function useTradeToken(pairParam: string | null | undefined): TradeTokenState {
  const catalogHit = useMemo(() => findArcToken(pairParam), [pairParam]);
  /** Keyed by the address it belongs to, so a stale row can never be shown. */
  const [remote, setRemote] = useState<{ key: string; token: ArcToken } | null>(null);
  const [unknownKey, setUnknownKey] = useState<string | null>(null);

  const wanted = pairParam ?? "";
  const needsRemote = !catalogHit && !!wanted && ADDRESS.test(wanted);

  /**
   * One fetch per unknown pair. All state is written by the request callbacks
   * (never synchronously in the effect body), and keyed by address so switching
   * pairs cannot show the previous pair's row.
   */
  useEffect(() => {
    if (!needsRemote) return;
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(wanted)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((b: { hits?: SearchHit[] }) => {
        const lower = wanted.toLowerCase();
        // Prefer the exact pair, then the token address, then the first row.
        const hit =
          b.hits?.find((h) => h.pairAddress.toLowerCase() === lower) ??
          b.hits?.find((h) => h.address.toLowerCase() === lower) ??
          b.hits?.[0];
        if (hit) setRemote({ key: wanted.toLowerCase(), token: hitToToken(hit) });
        else setUnknownKey(wanted.toLowerCase());
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [needsRemote, wanted]);

  /** Live numbers are keyed by token address, so the resolved token gets the overlay too. */
  const resolved = remote && remote.key === wanted.toLowerCase() ? remote.token : null;
  const base = catalogHit ?? resolved ?? ARC_TRENDING[0];
  const { merge } = useArcLive();
  const token = useMemo(() => merge(base), [merge, base]);

  const origin: TradeTokenState["origin"] = catalogHit ? "catalog" : "remote";
  /** In flight: the pair needs upstream and no row has landed for it yet. */
  const loading = needsRemote && !resolved && unknownKey !== wanted.toLowerCase();
  const unknown = needsRemote && unknownKey === wanted.toLowerCase();

  /** No param at all: the default trending pair, not an error state. */
  return { token, origin, loading, unknown };
}
