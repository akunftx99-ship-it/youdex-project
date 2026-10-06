import { NextResponse } from "next/server";
import { catalogAddresses, fetchArcStats, type ArcLiveStats } from "@/lib/arc-live";

/** Live upstream, never cached by the framework. */
export const dynamic = "force-dynamic";

/**
 * Peach bills a credit per batch, and several tabs poll this at once, so
 * identical pulls inside this window are served from memory.
 */
const TTL_MS = 4000;

let cache: { at: number; stats: Record<string, ArcLiveStats> } | null = null;

/** GET /api/prices — live price/volume/liquidity for every ARC pair we list. */
export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(
      { stats: cache.stats, live: Object.keys(cache.stats).length, cached: true },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const stats = await fetchArcStats(catalogAddresses());
  if (Object.keys(stats).length > 0) cache = { at: Date.now(), stats };

  const served = cache?.stats ?? {};
  return NextResponse.json(
    { stats: served, live: Object.keys(served).length, at: cache?.at ?? Date.now() },
    { headers: { "cache-control": "no-store" } },
  );
}
