"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ArcToken } from "@/lib/arc-data";
import type { ArcLiveStats } from "@/lib/arc-live";

export type ArcLiveStatus = "connecting" | "live" | "offline";

type ArcLiveState = {
  stats: Record<string, ArcLiveStats>;
  status: ArcLiveStatus;
  /** Epoch ms of the payload currently in `stats`. */
  at: number;
};

/**
 * One shared poller for the whole app.
 *
 * The catalog in arc-data.ts is a frozen snapshot — prices, volumes and changes
 * copied once when the catalog was built. Painting those numbers and then
 * swapping in live ones a second later is the "shows old data, then it jumps"
 * behaviour nobody wants, so every consumer watches `status` and renders
 * skeletons while it is "connecting"; only an upstream payload is ever painted
 * as a number.
 *
 * A module-level store means the sidebar ticker, the header ticker and every
 * table read the same payload — one request per interval, not one per
 * component.
 */
const EMPTY: ArcLiveState = { stats: {}, status: "connecting", at: 0 };

let state: ArcLiveState = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: AbortController | null = null;

const POLL_MS = 6000;

function setState(next: ArcLiveState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function poll() {
  inflight = new AbortController();
  try {
    const res = await fetch("/api/prices", { signal: inflight.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`prices ${res.status}`);
    const body = (await res.json()) as { stats?: Record<string, ArcLiveStats>; at?: number };
    const stats = body.stats ?? {};
    // Never let an empty-but-successful reply wipe a live payload off screen.
    if (Object.keys(stats).length > 0 || state.status !== "live") {
      setState({ stats, status: "live", at: body.at ?? Date.now() });
    }
  } catch {
    if (!inflight.signal.aborted && state.status !== "live") {
      setState({ ...state, status: "offline" });
    }
  }
  if (listeners.size > 0) timer = setTimeout(poll, POLL_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) void poll();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      inflight?.abort();
    }
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

export function useArcLive() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const merge = useCallback(
    (token: ArcToken): ArcToken => {
      const live = snap.stats[token.address.toLowerCase()];
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
    [snap],
  );

  const mergeAll = useCallback((tokens: ArcToken[]) => tokens.map(merge), [merge]);

  /** Live stats for a single token, or null until the feed has answered for it. */
  const liveFor = useCallback(
    (token: ArcToken) => snap.stats[token.address.toLowerCase()] ?? null,
    [snap],
  );

  const totals = useMemo(() => {
    let volume = 0;
    let liquidity = 0;
    for (const entry of Object.values(snap.stats)) {
      volume += entry.volume.h24;
      liquidity += entry.liquidity;
    }
    return { volume, liquidity };
  }, [snap]);

  const liveCount = Object.keys(snap.stats).length;

  return {
    status: snap.status,
    at: snap.at,
    /** True only once real upstream numbers are on hand — the UI's skeleton gate. */
    hasLive: snap.status === "live" && liveCount > 0,
    liveCount,
    merge,
    mergeAll,
    liveFor,
    totals,
  };
}
