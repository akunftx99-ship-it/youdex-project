/**
 * POST /api/swap/1inch
 *
 * Proxy to the 1inch Swap API for Arc (5042). Actions:
 *   action "quote"   -> live amountOut from their router (aggregates every
 *                       Arc venue: Uniswap v3/v4, Aero, ... — one call, no
 *                       manual pool math, no PoolKey risk)
 *   action "swap"    -> unsigned tx data for the 1inch Aggregation Router
 *   action "decimals"-> on-chain decimals for the two tokens
 *
 * The tx that comes back is executed by the browser with the user's key; the
 * server never signs. Requires INCH_API_KEY in .env.local.
 */
import { parseUnits, type Address } from "viem";
import { jsonWithBigInt } from "@/lib/json-bigint";
import { inchDecimals, inchQuote, inchSpender, inchSwapTx, INCH_ROUTER } from "@/lib/one-inch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT = /^\d*\.?\d+$/;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonWithBigInt({ error: "invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const src = String(body.src ?? "") as Address;
  const dst = String(body.dst ?? "") as Address;
  const amountIn = String(body.amountIn ?? "");
  const from = body.from ? (String(body.from) as Address) : undefined;
  const slippageBps = Number(body.slippageBps ?? 100);

  if (!ADDR.test(src) || !ADDR.test(dst)) {
    return jsonWithBigInt({ error: "src and dst must be 20-byte addresses" }, { status: 400 });
  }
  if (action !== "decimals" && !AMOUNT.test(amountIn)) {
    return jsonWithBigInt({ error: "amountIn must be a positive decimal string" }, { status: 400 });
  }
  if (action === "swap" && (!from || !ADDR.test(from))) {
    return jsonWithBigInt({ error: "swap needs `from` (the wallet address)" }, { status: 400 });
  }

  try {
    const decimals = await inchDecimals([src, dst]);
    const decimalsIn = decimals[src];

    if (action === "decimals") {
      return jsonWithBigInt({ src, dst, decimals });
    }

    const amountWei = parseUnits(amountIn, decimalsIn);
    if (amountWei <= 0n) return jsonWithBigInt({ error: "amountIn rounds to zero" }, { status: 400 });

    if (action === "quote") {
      const q = await inchQuote({ src, dst, amountWei });
      return jsonWithBigInt({
        spender: await inchSpender(),
        amountIn: amountWei.toString(),
        amountOut: q.dstAmount,
        gasEstimate: q.estimatedGas,
        slippageBps,
      });
    }

    if (action === "swap") {
      const { tx } = await inchSwapTx({ src, dst, amountWei, from: from as `0x${string}`, slippageBps });
      return jsonWithBigInt({
        spender: INCH_ROUTER,
        amountIn: amountWei.toString(),
        slippageBps,
        tx,
      });
    }

    return jsonWithBigInt({ error: `unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithBigInt({ error: "1inch request failed", detail: message.slice(0, 400) }, {
      status: message.includes("INCH_API_KEY") ? 503 : 502,
    });
  }
}