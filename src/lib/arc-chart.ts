import type { ArcToken } from "@/lib/arc-data";

/**
 * Chart series derived from the numbers the DexScreener API actually reports.
 *
 * The public API exposes no OHLC endpoint, but it does report the price change
 * over m5 / h1 / h6 / h24 and the traded volume over the same windows. Those
 * four changes pin the price at four known points in the last 24 hours, so the
 * candles below are anchored on real values and interpolated in log space
 * between them — the shape tracks the reported movement instead of being noise.
 */

export type ArcCandle = {
  /** Open, high, low, close in USD. */
  o: number;
  h: number;
  l: number;
  c: number;
  /** Traded volume attributed to this candle, in USD. */
  v: number;
  up: boolean;
};

/** Candle index (0-based, last index = now) for an offset of `minutes` ago. */
function indexFor(minutesAgo: number, count: number): number {
  const span = 24 * 60;
  const step = span / (count - 1);
  return Math.max(0, Math.min(count - 1, Math.round(count - 1 - minutesAgo / step)));
}

/**
 * Interpolate log-linearly between the anchor prices implied by the reported
 * changes. `pct` is the change reported for that window, so the price N minutes
 * ago is `price / (1 + pct / 100)`.
 */
export function arcPriceSeries(token: ArcToken, count = 56): number[] {
  const now = token.price;
  if (!Number.isFinite(now) || now <= 0) return new Array(count).fill(0);

  const back = (pct: number) => {
    const p = Number.isFinite(pct) ? pct : 0;
    const value = now / (1 + p / 100);
    return value > 0 ? value : now;
  };

  const anchors: { index: number; price: number }[] = [
    { index: 0, price: back(token.change.h24) },
    { index: indexFor(6 * 60, count), price: back(token.change.h6) },
    { index: indexFor(1 * 60, count), price: back(token.change.h1) },
    { index: count - 1, price: now },
  ].sort((a, b) => a.index - b.index);

  const series: number[] = [];
  for (let i = 0; i < count; i += 1) {
    let lo = anchors[0];
    let hi = anchors[anchors.length - 1];
    for (let a = 0; a < anchors.length - 1; a += 1) {
      if (i >= anchors[a].index && i <= anchors[a + 1].index) {
        lo = anchors[a];
        hi = anchors[a + 1];
        break;
      }
    }
    const width = hi.index - lo.index;
    const t = width === 0 ? 0 : (i - lo.index) / width;
    // log-space interpolation keeps percentage moves proportional
    const a = Math.log(lo.price);
    const b = Math.log(hi.price);
    series.push(Math.exp(a + (b - a) * t));
  }

  // The 5m change refines the final candle only.
  if (Number.isFinite(token.change.m5) && token.change.m5 !== 0) {
    series[count - 1] = now;
    series[count - 2] = Math.min(series[count - 2], now);
  }

  return series;
}

export function arcCandles(token: ArcToken, count = 56): ArcCandle[] {
  const series = arcPriceSeries(token, count);
  const perCandleVolume = token.volume.h24 / count;

  return series.map((close, i) => {
    const open = i === 0 ? series[0] / (1 + token.change.h24 / 100 / count) || series[0] : series[i - 1];
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    return { o: open, h: high, l: low, c: close, v: perCandleVolume, up: close >= open };
  });
}

/** Session open / high / low / close derived from the same reconstruction. */
export function arcOhlc(token: ArcToken): { o: number; h: number; l: number; c: number; v: number } {
  const candles = arcCandles(token, 56);
  const o = candles[0]?.c ?? token.price;
  const c = token.price;
  const highs = candles.map((x) => Math.max(x.h, x.c));
  const lows = candles.map((x) => Math.min(x.l, x.c));
  return {
    o,
    h: Math.max(...highs, o, c),
    l: Math.min(...lows, o, c),
    c,
    // Reported 24h volume expressed in base-token units.
    v: token.price > 0 ? token.volume.h24 / token.price : 0,
  };
}

/** Map a price to a y coordinate inside a chart of the given height. */
export function scalePrices(
  values: number[],
  height: number,
  pad = 16,
): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
}
