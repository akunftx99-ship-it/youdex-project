import { NextResponse } from "next/server";
import { fetchArcSwaps } from "@/lib/arc-swaps";

/** Live upstream, never cached. */
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_LIMIT = 100;

/** GET /api/swaps?address=0x…&limit=40 — recent fills for one ARC pair. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const requested = Number(searchParams.get("limit") ?? 40);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    : 40;

  if (!ADDRESS.test(address)) {
    return NextResponse.json({ swaps: [], error: "invalid token address" }, { status: 400 });
  }

  const { swaps, error } = await fetchArcSwaps(address, limit);
  if (error) {
    return NextResponse.json({ swaps, error }, { status: 502 });
  }
  return NextResponse.json({ swaps }, { headers: { "cache-control": "no-store" } });
}
