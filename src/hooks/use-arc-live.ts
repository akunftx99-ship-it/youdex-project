"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArcToken } from "@/lib/arc-data";
import type { ArcLiveStats } from "@/lib/arc-live";

export type ArcLiveStatus = "connecting" | "live" | "offline";

/**
 * Polls /api/prices and overlays live numbers onto the static catalog.
 *
 * arc-data.ts keeps owning identity — symbol, name, addresses, logos, DEX
 * links — while every figure the market UI sorts or renders comes from here.
 * Tokens the upstream does not know about keep their snapshot values.
 */
export function useArcLive(pollMs = 8000) {
  const [stats, setStats] = useState<Record<string, ArcLiveStats>>({});
  const [status, setStatus] = useState<ArcLiveStatus>("connecting");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/prices", { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`prices ${res.status}`);
        const body = (await res.json()) as { stats?: Record<string, ArcLiveStats> };
        if (stopped) return;
        setStats(body.stats ?? {});
        setStatus("live");
      } catch {
        if (!controller.signal.aborted) setStatus("offline");
      }
      if (!stopped) timer = setTimeout(poll, pollMs);
    };

    timer = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [pollMs]);

  const merge = useCallback(
    (token: ArcToken): ArcToken => {
      const live = stats[token.address.toLowerCase()];
      if (!live) return token;
      return {
        ...token,
        price: live.price,
        change: { ...live.change },
        volume: { ...live.volume },
        liquidity: live.liquidity || token.liquidity,
        marketCap: live.marketCap || token.marketCap,
        fdv: live.marketCap || token.fdv,
        txns24: { ...live.txns24 },
      };
    },
    [stats],
  );

  const mergeAll = useCallback((tokens: ArcToken[]) => tokens.map(merge), [merge]);

  const totals = useMemo(() => {
    let volume = 0;
    let liquidity = 0;
    for (const entry of Object.values(stats)) {
      volume += entry.volume.h24;
      liquidity += entry.liquidity;
    }
    return { volume, liquidity };
  }, [stats]);

  return { status, liveCount: Object.keys(stats).length, merge, mergeAll, totals };
}
