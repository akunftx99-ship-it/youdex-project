/**
 * GET /api/swap/1inch/status
 *
 * Tells the client whether an INCH_API_KEY is configured so the order panel can
 * pick execution mode: 1inch aggregation + orderbook when the key exists, the
 * direct-contract path otherwise. Never leaks the key itself — just a boolean.
 */
import { jsonWithBigInt } from "@/lib/json-bigint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonWithBigInt({
    keySet: !!process.env.INCH_API_KEY,
    router: "0xe08cab0828a67291ec4af1fb3e7f867e206a6bda",
    chainId: 5042,
  });
}