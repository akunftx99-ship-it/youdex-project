#!/usr/bin/env node
/**
 * Refresh src/lib/arc-data.ts from the DexScreener public API.
 *
 *   node scripts/fetch-arc.mjs
 *
 * Endpoints (https://docs.dexscreener.com/api/reference):
 *   GET /latest/dex/search?q=          pair discovery            (300 rpm)
 *   GET /tokens/v1/arc/{addresses}     batch lookup, 30 per call (300 rpm)
 *   GET /latest/dex/pairs/arc/{pair}   pair detail incl. imagery (300 rpm)
 *
 * There is no OHLC endpoint on the public API, so only the reported numbers are
 * captured: price, per-timeframe change, per-timeframe volume, liquidity, FDV,
 * market cap and transaction counts. Charts are reconstructed from those — see
 * src/lib/arc-chart.ts.
 *
 * Discovery sweeps a broad keyword list because /latest/dex/search is the only
 * endpoint that surfaces ARC pairs: /token-profiles, /token-boosts and
 * /metas/trending never contain chainId "arc".
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://api.dexscreener.com";
const CHAIN = "arc";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const WORDS = [
  "arc", "arcx", "arcd", "arct", "arc1", "arc2", "argus", "archiel", "arclight", "arclend",
  "arcman", "arctools", "arcdog", "cirbtc", "circle", "circ", "eurc", "gbpa", "xaum", "usdc",
  "usdt", "weth", "wbtc", "cbbtc", "tbtc", "btc", "eth", "sol", "bnb", "ai", "agents", "agent",
  "token", "coins", "coin", "meme", "inu", "cat", "dog", "defi", "swap", "dex", "pay", "bank",
  "gold", "usd", "vault", "farm", "pool", "stake", "lend", "bridge", "oracle", "node", "layer",
  "nft", "dao", "gov", "vote", "launch", "pump", "moon", "gem", "alpha", "test", "demo", "proto",
  "mss2", "glitch", "tide", "gpool", "fyn", "apy", "apr", "yield", "earn", "reward", "point",
  "season", "quest", "tolly", "gas", "cool", "dividend", "astock", "stock", "tsla", "apple",
  "bond", "tremp", "ghost", "goose", "growblocks", "af", "aa", "ab", "ac", "ad", "sm", "ni",
  "pp", "hi", "mi", "r", "id", "dt", "mb", "xm", "ss", "sa", "ae", "10m", "arcx10",
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const KEYWORDS = [...new Set([...LETTERS, ...WORDS])];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function collectPairs() {
  const found = new Map();
  for (const q of KEYWORDS) {
    try {
      const data = await getJson(`${API}/latest/dex/search?q=${encodeURIComponent(q)}`);
      for (const p of data.pairs ?? []) {
        if (p?.chainId === CHAIN) found.set(p.pairAddress, p);
      }
    } catch (err) {
      process.stderr.write(`  ${q}: ${err.message}\n`);
    }
    await sleep(350);
  }
  process.stderr.write(
    `discovered ${found.size} ARC pairs across ${KEYWORDS.length} keywords\n`,
  );
  return [...found.values()];
}

/**
 * One row per ticker, represented by that token's deepest pool. Several ARC
 * deployments reuse a symbol (ARCMAN, Circle), so de-duplicating per symbol is
 * what keeps the table readable rather than showing the same name five times.
 */
function oneRowPerToken(pairs) {
  const best = new Map();
  for (const p of pairs) {
    const symbol = (p.baseToken?.symbol ?? "").trim().toUpperCase();
    const vol = num(p.volume?.h24);
    const price = Number(p.priceUsd);
    if (!symbol || vol <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const prev = best.get(symbol);
    const liq = num(p.liquidity?.usd);
    if (!prev || [liq, vol] > [num(prev.liquidity?.usd), num(prev.volume?.h24)]) best.set(symbol, p);
  }
  return [...best.values()];
}

/** Look up token logos; most small ARC tokens have none and fall back to initials. */
async function enrichImages(pairs) {
  const images = new Map();
  for (const p of pairs) {
    if (p.info?.imageUrl) {
      images.set(p.pairAddress, p.info.imageUrl);
      continue;
    }
    const pairId = p.url?.split("/").pop();
    if (!pairId) continue;
    try {
      const res = await getJson(`${API}/latest/dex/pairs/${CHAIN}/${pairId}`);
      const url = res.pairs?.[0]?.info?.imageUrl;
      if (url) images.set(p.pairAddress, url);
    } catch {
      /* logo is optional */
    }
    await sleep(1100);
  }
  return images;
}

function render(pairs, images) {
  const byVolume = [...pairs].sort((a, b) => num(b.volume?.h24) - num(a.volume?.h24));
  const withChange = pairs.filter((p) => Number.isFinite(Number(p.priceChange?.h24)));
  const byChange = [...withChange].sort((a, b) => num(b.priceChange?.h24) - num(a.priceChange?.h24));
  const gainers = byChange.filter((p) => num(p.priceChange?.h24) > 0);
  const losers = [...byChange].filter((p) => num(p.priceChange?.h24) < 0).reverse();

  const L = [];
  const A = (line) => L.push(line);
  A("/**");
  A(" * ARC-network market data — DexScreener public API snapshot.");
  A(" *");
  A(` * Generated ${new Date().toISOString()} by scripts/fetch-arc.mjs — do not hand-edit.`);
  A(" *");
  A(" * Endpoints: /latest/dex/search (discovery), /tokens/v1/arc/{addresses}");
  A(" * (batch lookup), /latest/dex/pairs/arc/{pair} (imagery). Docs:");
  A(" * https://docs.dexscreener.com/api/reference");
  A(" *");
  A(` * ${pairs.length} ARC tokens traded in the last 24h. There is no OHLC endpoint, so`);
  A(" * charts are reconstructed from the m5/h1/h6/h24 changes and volumes —");
  A(" * see src/lib/arc-chart.ts.");
  A(" */");
  A("");
  A('export type ArcTimeframe = "m5" | "h1" | "h6" | "h24";');
  A("");
  A("export type ArcToken = {");
  A("  symbol: string;");
  A("  name: string;");
  A("  quote: string;");
  A("  pair: string;");
  A("  address: string;");
  A("  pairAddress: string;");
  A("  dex: string;");
  A("  price: number;");
  A("  change: Record<ArcTimeframe, number>;");
  A("  volume: Record<ArcTimeframe, number>;");
  A("  liquidity: number;");
  A("  fdv: number;");
  A("  marketCap: number;");
  A("  txns24: { buys: number; sells: number };");
  A("  createdAt: number | null;");
  A("  image: string | null;");
  A("  dexUrl: string;");
  A("};");
  A("");
  A('export const ARC_CHAIN = "arc" as const;');
  A("");

  const esc = (v) => JSON.stringify(String(v ?? ""));

  const emit = (name, rows, doc) => {
    A(`/** ${doc} */`);
    A(`export const ${name}: ArcToken[] = [`);
    for (const p of rows) {
      const img = images.get(p.pairAddress) ?? p.info?.imageUrl ?? null;
      A("  {");
      A(`    symbol: ${esc(p.baseToken?.symbol)},`);
      A(`    name: ${esc(p.baseToken?.name)},`);
      A(`    quote: ${esc(p.quoteToken?.symbol)},`);
      A(`    pair: ${esc(`${p.baseToken?.symbol}/${p.quoteToken?.symbol}`)},`);
      A(`    address: ${esc(p.baseToken?.address)},`);
      A(`    pairAddress: ${esc(p.pairAddress)},`);
      A(`    dex: ${esc(p.dexId)},`);
      A(`    price: ${num(p.priceUsd)},`);
      A(
        `    change: { m5: ${num(p.priceChange?.m5)}, h1: ${num(p.priceChange?.h1)}, h6: ${num(p.priceChange?.h6)}, h24: ${num(p.priceChange?.h24)} },`,
      );
      A(
        `    volume: { m5: ${num(p.volume?.m5)}, h1: ${num(p.volume?.h1)}, h6: ${num(p.volume?.h6)}, h24: ${num(p.volume?.h24)} },`,
      );
      A(`    liquidity: ${num(p.liquidity?.usd)},`);
      A(`    fdv: ${num(p.fdv)},`);
      A(`    marketCap: ${num(p.marketCap)},`);
      A(`    txns24: { buys: ${num(p.txns?.h24?.buys)}, sells: ${num(p.txns?.h24?.sells)} },`);
      A(`    createdAt: ${p.pairCreatedAt ? num(p.pairCreatedAt) : "null"},`);
      A(`    image: ${img ? esc(img) : "null"},`);
      A(`    dexUrl: ${esc(p.url)},`);
      A("  },");
    }
    A("];");
    A("");
  };

  // Market cap ranking for the Hot tab: only tokens with a live market, so a
  // $5B "market cap" with zero trades cannot sit at the top of the list.
  const live = pairs.filter((p) => num(p.liquidity?.usd) >= 1000 && num(p.volume?.h24) >= 1);
  const byMcap = [...live].sort(
    (a, b) => num(b.marketCap || b.fdv) - num(a.marketCap || a.fdv),
  );

  emit("ARC_TOP_VOLUME", byVolume.slice(0, 50), "50 ARC tokens with the highest 24h USD volume.");
  emit(
    "ARC_TOP_MCAP",
    byMcap.slice(0, 50),
    "50 ARC tokens with the largest market cap that still have a live market (\u2265$1,000 liquidity and \u2265$1 of 24h volume).",
  );
  emit("ARC_TOP_MOVERS", byChange.slice(0, 50), "50 ARC tokens with the largest 24h price move.");
  emit("ARC_GAINERS", gainers.slice(0, 50), "ARC tokens up over the last 24h, biggest gain first.");
  emit("ARC_LOSERS", losers.slice(0, 50), "ARC tokens down over the last 24h, biggest drop first.");
  emit("ARC_ALL", byVolume, "Every ARC token tracked, ordered by 24h volume.");
  A("/** Aliases kept for the shared market components. */");
  A("export const ARC_HOT = ARC_TOP_MCAP;");
  A("export const ARC_TOKENS = ARC_ALL;");
  A("export const ARC_NEW = [...ARC_ALL].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));");
  A("");
  A("export const ARC_TOTAL_VOLUME_24H = ARC_ALL.reduce((s, t) => s + t.volume.h24, 0);");
  A("export const ARC_TOTAL_LIQUIDITY = ARC_ALL.reduce((s, t) => s + t.liquidity, 0);");
  A("");
  return L.join("\n");
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "lib", "arc-data.ts");

const discovered = await collectPairs();
const tokens = oneRowPerToken(discovered);
const images = await enrichImages(tokens);

await writeFile(target, render(tokens, images), "utf8");
process.stderr.write(`\nwrote ${tokens.length} ARC tokens -> ${target}\n`);
