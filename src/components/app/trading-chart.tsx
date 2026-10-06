"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ArcToken } from "@/lib/arc-data";
import { arcPriceSeries } from "@/lib/arc-chart";
import { formatArcPrice, formatUsd } from "@/components/app/arc-market-table";
import { cn } from "@/lib/utils";

/**
 * ARC candlestick chart, TradingView Lightweight Charts on real OHLCV data.
 *
 * Data source: GeckoTerminal (CoinGecko's DEX product).
 *   GET https://api.geckoterminal.com/api/v2/networks/arc/pools/{pool}
 *       /ohlcv/{timeframe}?aggregate=N&limit=1000&currency=usd
 * The API sends `access-control-allow-origin: *`, so this runs straight from the
 * browser and the candles are the venue's own — real opens, wicks and volume,
 * no reconstruction.
 *
 * DexScreener's public API has no OHLC endpoint, so the reconstructed series
 * (src/lib/arc-chart.ts) is only used as a fallback if GeckoTerminal rate-limits
 * us; the chart marks that state so the two are never confused.
 */

export type ChartInterval = "5m" | "15m" | "1H" | "4H" | "1D";

export const CHART_INTERVALS: {
  key: ChartInterval;
  timeframe: "minute" | "hour" | "day";
  aggregate: number;
  /** Bars to synthesise if the live feed is unavailable. */
  fallbackBars: number;
  label: string;
}[] = [
  { key: "5m", timeframe: "minute", aggregate: 5, fallbackBars: 288, label: "5m" },
  { key: "15m", timeframe: "minute", aggregate: 15, fallbackBars: 96, label: "15m" },
  { key: "1H", timeframe: "hour", aggregate: 1, fallbackBars: 24, label: "1H" },
  { key: "4H", timeframe: "hour", aggregate: 4, fallbackBars: 6, label: "4H" },
  { key: "1D", timeframe: "day", aggregate: 1, fallbackBars: 3, label: "1D" },
];

/**
 * Successful responses are cached per pool + interval. The free GeckoTerminal
 * tier rate-limits quickly, and flipping between intervals should not spend a
 * request every time — a cache hit also means a rate-limited retry can still
 * show real candles instead of dropping to the estimate.
 */
const ohlcvCache = new Map<string, unknown>();

/**
 * Bars kept on screen when the feed first paints. 1000 bars in a 600px pane is
 * 0.6px per candle — the chart opens as a grey smear. ~110 keeps bodies wide
 * enough to read on every interval while the rest of the history stays
 * scrollable to the left.
 */
const INITIAL_BARS = 110;

/** Bars are packed this tight only if the pane is narrower than expected. */
const MIN_BAR_SPACING = 3;

/** Candles have no push channel, so the open chart re-pulls on this clock. */
const REFRESH_MS = 20_000;

const GECKO = "https://api.geckoterminal.com/api/v2";

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** GeckoTerminal returns `[ts, o, h, l, c, v]`, newest first. */
function fromGecko(list: number[][]): Candle[] {
  const seen = new Set<number>();
  return list
    .map((row) => ({
      time: Math.floor(row[0]) as UTCTimestamp,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.close) &&
        c.open > 0 &&
        c.close > 0 &&
        !seen.has(c.time) &&
        (seen.add(c.time), true),
    )
    .sort((a, b) => a.time - b.time);
}

/** Fallback only: rebuild candles from the API's reported m5/h1/h6/h24 changes. */
function reconstructed(
  token: ArcToken,
  bars = 200,
  timeframe: "minute" | "hour" | "day" = "hour",
  aggregate = 1,
): Candle[] {
  const closes = arcPriceSeries(token, bars);
  const nowSec = Math.floor(Date.now() / 1000);
  const unit = timeframe === "minute" ? 60 : timeframe === "hour" ? 3600 : 86400;
  const step = unit * aggregate;
  const perBar = token.volume.h24 / bars;
  const flat = token.price > 0 ? token.price : 0;

  return closes.map((close, i) => {
    const prev = i === 0 ? closes[0] : closes[i - 1];
    const open = Number.isFinite(prev) && prev > 0 ? prev : flat;
    const c = Number.isFinite(close) && close > 0 ? close : flat;
    return {
      time: (nowSec - Math.floor((bars - 1 - i) * step)) as UTCTimestamp,
      open,
      high: Math.max(open, c),
      low: Math.min(open, c),
      close: c,
      volume: perBar,
    };
  });
}

export function TradingChart({ token, interval }: { token: ArcToken; interval: ChartInterval }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [state, setState] = useState<"loading" | "live" | "fallback">("loading");
  const [latest, setLatest] = useState<Candle | null>(null);

  const spec = useMemo(
    () => CHART_INTERVALS.find((i) => i.key === interval) ?? CHART_INTERVALS[0],
    [interval],
  );

  const pairAddress = token.pairAddress;

  /**
   * The parent re-renders on every price poll. The chart only cares about the
   * pool, so the latest token is kept in a ref and the fetch effect stays keyed
   * on the pool — otherwise it would re-request the feed every few seconds.
   */
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#7588a3",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)", style: LineStyle.Solid },
        horzLines: { color: "rgba(255,255,255,0.05)", style: LineStyle.Solid },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        // Candles own the top 74% of the pane; the volume histogram sits in the
        // remaining 26%. The two numbers must match the "vol" scale margin
        // below, or the price labels stop lining up with the candles.
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        /** Lowest zoom: below this the bodies vanish into the grid. */
        minBarSpacing: MIN_BAR_SPACING,
        /** Wheel/drag zoom stays available; the first paint just opens readable. */
        fixLeftEdge: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255,255,255,0.28)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1c2129",
        },
        horzLine: {
          color: "rgba(255,255,255,0.28)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1c2129",
        },
      },
      localization: { priceFormatter: (p: number) => formatArcPrice(p) },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#00ff1e",
      downColor: "#ef4444",
      borderUpColor: "#00ff1e",
      borderDownColor: "#ef4444",
      wickUpColor: "#00ff1e",
      wickDownColor: "#ef4444",
      priceLineColor: "#22d3ee",
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "rgba(0,255,30,0.35)",
      /** `lastValueVisible` / `priceLineVisible` off — see the note below. */
      lastValueVisible: false,
      priceLineVisible: false,
    });
    /**
     * The volume series rides its own scale pinned to the bottom 26% of the
     * pane. Scaling it independently is what produced the stray label at the
     * foot of the price axis, so the scale is hidden and its margins are the
     * mirror image of the candle scale above: 74% empty, volume in what is
     * left — so the histogram lines up under its candles.
     */
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.74, bottom: 0 },
      visible: false,
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    const onMove = (param: MouseEventParams) => {
      if (!param.time) {
        setHover(null);
        return;
      }
      const d = param.seriesData.get(candle) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      const v = param.seriesData.get(volume) as { value: number } | undefined;
      if (!d) {
        setHover(null);
        return;
      }
      setHover({
        time: param.time as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: v?.value ?? 0,
      });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  const paint = useCallback((data: Candle[]) => {
    const candle = candleRef.current;
    const volume = volumeRef.current;
    const chart = chartRef.current;
    if (!candle || !volume || !chart || data.length === 0) return false;

    candle.setData(
      data.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    volume.setData(
      data.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(0,255,30,0.32)" : "rgba(239,68,68,0.32)",
      })),
    );
    /**
     * fitContent() on a 1000-bar feed squeezes ten days into one screen and every
     * candle collapses to a hairline. Open on the newest INITIAL_BARS instead:
     * the candles keep a readable body width and the earlier history is still
     * one scroll away.
     */
    const last = data.length - 1;
    chart.timeScale().setVisibleLogicalRange({ from: last - INITIAL_BARS + 1, to: last + 2 });
    setHover(null);
    setLatest(data[data.length - 1] ?? null);
    return true;
  }, []);

  useEffect(() => {
    if (!pairAddress) return;
    let cancelled = false;

    const key = `${pairAddress}|${spec.timeframe}|${spec.aggregate}`;
    const url =
      `${GECKO}/networks/arc/pools/${encodeURIComponent(pairAddress)}` +
      `/ohlcv/${spec.timeframe}?aggregate=${spec.aggregate}&limit=1000&currency=usd`;

    const paintFallback = () => {
      paint(reconstructed(tokenRef.current, spec.fallbackBars, spec.timeframe, spec.aggregate));
      setState("fallback");
    };

    const load = async () => {
      // Yield first so every state write below lands after the effect body.
      await Promise.resolve();
      if (cancelled) return;

      // Only the first load trusts the cache; a refresh always hits the feed.
      const cached = tick === 0 ? (ohlcvCache.get(key) as number[][] | undefined) : undefined;
      if (cached?.length && paint(fromGecko(cached))) {
        setState("live");
        return;
      }

      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          data?: { attributes?: { ohlcv_list?: number[][] } };
        };
        if (cancelled) return;

        const list = json?.data?.attributes?.ohlcv_list;
        const candles = list?.length ? fromGecko(list) : [];
        if (candles.length && paint(candles)) {
          if (list) ohlcvCache.set(key, list);
          setState("live");
          return;
        }
        paintFallback();
      } catch {
        if (cancelled) return;
        // Rate-limited or offline: keep real candles if we ever had them.
        const prev = [...ohlcvCache.entries()].find(([k]) => k.startsWith(`${pairAddress}|`));
        const prevList = prev?.[1] as number[][] | undefined;
        if (prevList?.length && paint(fromGecko(prevList))) {
          setState("live");
          return;
        }
        paintFallback();
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [pairAddress, spec, paint, tick]);

  const shown = hover ?? latest;
  const up = shown ? shown.close >= shown.open : true;
  const pct = shown && shown.open > 0 ? ((shown.close - shown.open) / shown.open) * 100 : 0;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>
          O:<span className="text-muted-foreground">{shown ? formatArcPrice(shown.open) : "—"}</span>
        </span>
        <span>
          H:<span className="text-success">{shown ? formatArcPrice(shown.high) : "—"}</span>
        </span>
        <span>
          L:<span className="text-danger">{shown ? formatArcPrice(shown.low) : "—"}</span>
        </span>
        <span>
          C:<span className={up ? "text-success" : "text-danger"}>{shown ? formatArcPrice(shown.close) : "—"}</span>
        </span>
        <span>
          VOL:<span className="text-foreground">{shown ? formatUsd(shown.volume) : "—"}</span>
        </span>
        <span className={cn("font-semibold", up ? "text-success" : "text-danger")}>
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wider">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state === "live" ? "bg-success" : state === "loading" ? "bg-muted-foreground" : "bg-danger",
            )}
          />
          {state === "live" ? "GeckoTerminal" : state === "loading" ? "loading…" : "estimated (rate limited)"}
        </span>
      </div>
      <div ref={holder} className="min-h-0 flex-1" />
    </div>
  );
}
