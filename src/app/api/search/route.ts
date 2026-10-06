/**
 * Token search for the top-bar box.
 *
 * Two ways in, one shape out:
 *   - a pasted address (0x + 40 hex) is looked up directly
 *   - free text matches symbol / name / pair
 *
 * Sources, in the order they are trusted:
 *   1. the local catalog (arc-data.ts) — instant, always available
 *   2. DexScreener  /latest/dex/search — finds ARC pairs the snapshot missed
 *   3. Peach        /arc/pro/v2/coins   — live price / volume / mcap overlay
 *
 * DexScreener's payload is authoritative for identity (addresses, dex, quote),
 * Peach for the numbers. Anything DexScreener did not return is still listed if
 * Peach knows the address, so a pasted address always resolves.
 */

import { NextResponse } from "next/server";
import { ARC_EVERY, type ArcToken } from "@/lib/arc-data";
import { peachJsonRetry } from "@/lib/arc-upstream";

export const dynamic = "force-dynamic";

const DEX = "https://api.dexscreener.com";
const CHAIN = "arc";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_RESULTS = 12;

/** One row in the dropdown. Flat on purpose — the client renders it directly. */
export type SearchHit = {
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
  /** Where the row came from, so the UI can label it. */
  source: "catalog" | "dexscreener";
};

type DexPair = {
  chainId?: string;
  pairAddress?: string;
  dexId?: string;
  url?: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { symbol?: string };
  info?: { imageUrl?: string };
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Local catalog row -> a hit, numbers from the snapshot (Peach may refine). */
function fromCatalog(token: ArcToken): SearchHit {
  return {
    pairAddress: token.pairAddress,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    quote: token.quote,
    pair: token.pair,
    dex: token.dex,
    image: token.image,
    price: token.price,
    change24h: token.change.h24,
    volume24h: token.volume.h24,
    liquidity: token.liquidity,
    marketCap: token.marketCap || token.fdv,
    source: "catalog",
  };
}

/** DexScreener pair -> a hit. */
function fromDex(pair: DexPair): SearchHit | null {
  const pairAddress = pair.pairAddress ?? "";
  const address = pair.baseToken?.address ?? "";
  const symbol = (pair.baseToken?.symbol ?? "").trim();
  if (!pairAddress || !address || !symbol) return null;

  const price = num(pair.priceUsd);
  if (price <= 0) return null;

  const quote = (pair.quoteToken?.symbol ?? "").trim() || "USDC";
  return {
    pairAddress,
    address,
    symbol,
    name: (pair.baseToken?.name ?? symbol).trim(),
    quote,
    pair: `${symbol}/${quote}`,
    dex: pair.dexId ?? "",
    image: pair.info?.imageUrl ?? null,
    price,
    change24h: num(pair.priceChange?.h24),
    volume24h: num(pair.volume?.h24),
    liquidity: num(pair.liquidity?.usd),
    marketCap: num(pair.marketCap) || num(pair.fdv),
    source: "dexscreener",
  };
}

/** DexScreener free-text search, ARC chain only. */
async function dexscreenerSearch(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(`${DEX}/latest/dex/search?q=${encodeURIComponent(query)}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { pairs?: DexPair[] };
    return (body.pairs ?? [])
      .filter((p) => p.chainId === CHAIN)
      .map(fromDex)
      .filter((h): h is SearchHit => h !== null);
  } catch {
    return [];
  }
}

/** One address straight from DexScreener — covers pairs outside the catalog. */
async function dexscreenerAddress(address: string): Promise<SearchHit | null> {
  try {
    const res = await fetch(`${DEX}/latest/dex/tokens/${address}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { pairs?: DexPair[] };
    const hits = (body.pairs ?? [])
      .filter((p) => p.chainId === CHAIN)
      .map(fromDex)
      .filter((h): h is SearchHit => h !== null)
      .sort((a, b) => b.liquidity - a.liquidity);
    return hits[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Live numbers for the addresses we are about to show. Peach answers with the
 * same fields the market UI already uses; a miss leaves the row on its
 * DexScreener / snapshot figures rather than dropping it.
 */
async function peachOverlay(hits: SearchHit[]): Promise<SearchHit[]> {
  const addresses = [...new Set(hits.map((h) => h.address.toLowerCase()))];
  if (addresses.length === 0) return hits;

  const stats = new Map<string, { price: number; change: number; volume: number; liquidity: number; marketCap: number }>();
  try {
    const body = await peachJsonRetry<{ data?: { coin_list?: unknown[] } }>(
      "https://api.peach.ag/arc/v1/arc/pro/v2/coins",
      { method: "POST", body: { ids: addresses }, timeoutMs: 9000 },
    );
    for (const raw of body?.data?.coin_list ?? []) {
      const row = raw as Record<string, unknown>;
      const addr = typeof row.address === "string" ? row.address.toLowerCase() : "";
      const price = num(row.p);
      if (!addr || price <= 0) continue;
      stats.set(addr, {
        price,
        change: num(row.ch24h) * 100,
        volume: num(row.v24h),
        liquidity: num(row.liqUsd),
        marketCap: num(row.mcap),
      });
    }
  } catch {
    return hits;
  }

  return hits.map((hit) => {
    const live = stats.get(hit.address.toLowerCase());
    if (!live) return hit;
    return {
      ...hit,
      price: live.price,
      change24h: live.change,
      volume24h: live.volume || hit.volume24h,
      liquidity: live.liquidity || hit.liquidity,
      marketCap: live.marketCap || hit.marketCap,
    };
  });
}

/** Rank: exact symbol first, then starts-with, then substring, then volume. */
function rank(hits: SearchHit[], q: string): SearchHit[] {
  const needle = q.toLowerCase();
  const score = (h: SearchHit): number => {
    const symbol = h.symbol.toLowerCase();
    const name = h.name.toLowerCase();
    if (symbol === needle) return 0;
    if (h.pairAddress.toLowerCase() === needle || h.address.toLowerCase() === needle) return 0;
    if (symbol.startsWith(needle)) return 1;
    if (name.startsWith(needle)) return 2;
    if (symbol.includes(needle)) return 3;
    if (name.includes(needle)) return 4;
    return 5;
  };
  return [...hits].sort((a, b) => score(a) - score(b) || b.volume24h - a.volume24h);
}

/**
 * Dedupe in two passes: the same pool twice (pair address), then the same
 * ticker across venues — several ARC WETH/USDC pools exist and listing all of
 * them reads as a bug. Keep the deepest-liquidity row for each pair.
 */
function dedupe(hits: SearchHit[]): SearchHit[] {
  const byPair = new Map<string, SearchHit>();
  for (const hit of hits) {
    const key = hit.pairAddress.toLowerCase();
    const prev = byPair.get(key);
    if (!prev || hit.liquidity > prev.liquidity) byPair.set(key, hit);
  }

  const byTicker = new Map<string, SearchHit>();
  for (const hit of byPair.values()) {
    const key = `${hit.symbol.toLowerCase()}/${hit.quote.toLowerCase()}`;
    const prev = byTicker.get(key);
    if (!prev || hit.liquidity > prev.liquidity) byTicker.set(key, hit);
  }
  return [...byTicker.values()];
}

/** GET /api/search?q= — catalog + DexScreener discovery, Peach live numbers. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? MAX_RESULTS) || MAX_RESULTS, 1), 30);

  if (q.length < 2) {
    return NextResponse.json({ hits: [], query: q }, { headers: { "cache-control": "no-store" } });
  }

  const lower = q.toLowerCase();
  let hits: SearchHit[] = [];

  if (ADDRESS.test(q)) {
    // Pasted address: catalog first, then DexScreener by token address.
    const local = ARC_EVERY.filter(
      (t) => t.pairAddress.toLowerCase() === lower || t.address.toLowerCase() === lower,
    ).map(fromCatalog);
    hits.push(...local);
    if (hits.length === 0) {
      const remote = await dexscreenerAddress(q);
      if (remote) hits.push(remote);
    }
  } else {
    // Free text: local symbol / name match, then DexScreener discovery.
    const local = ARC_EVERY.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower) ||
        t.pair.toLowerCase().includes(lower),
    ).map(fromCatalog);
    hits.push(...local);
    hits.push(...(await dexscreenerSearch(q)));
  }

  hits = rank(dedupe(hits), q).slice(0, limit);
  hits = await peachOverlay(hits);

  return NextResponse.json(
    { hits, query: q, count: hits.length },
    { headers: { "cache-control": "no-store" } },
  );
}
