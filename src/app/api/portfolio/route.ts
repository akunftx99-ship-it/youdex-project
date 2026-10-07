/**
 * GET /api/portfolio?address=0x…
 *
 * Wallet holdings read straight from Arc's RPC via Multicall3 — one batched
 * balanceOf sweep over the app's token catalog, priced with the live Peach
 * feed. No indexer, no API key, no third party in the path.
 */
import { isAddress } from "viem";
import { jsonWithBigInt } from "@/lib/json-bigint";
import { readArcPortfolio } from "@/lib/arc-portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return jsonWithBigInt({ error: "address query param must be a valid 0x address" }, { status: 400 });
  }
  try {
    const portfolio = await readArcPortfolio(address);
    return jsonWithBigInt(portfolio);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithBigInt({ error: "portfolio read failed", detail: message.slice(0, 300) }, { status: 502 });
  }
}
