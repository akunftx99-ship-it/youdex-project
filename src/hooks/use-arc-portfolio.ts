"use client";

/**
 * Live wallet holdings for the Fund page.
 *
 * One call to our own /api/portfolio (a batched Multicall3 sweep on Arc's RPC),
 * refreshed on an interval and on demand after a fill.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArcPortfolio } from "@/lib/arc-portfolio";

const POLL_MS = 25_000;

export function useArcPortfolio(address?: string) {
  const [data, setData] = useState<ArcPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!address || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/portfolio?address=${address}`, { cache: "no-store" });
      const json = (await res.json()) as ArcPortfolio & { error?: string; detail?: string };
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "portfolio fetch failed");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 200) : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) { setData(null); return; }
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, refresh]);

  return { data, loading, error, refresh };
}
