/**
 * POST /api/swap/quote
 *
 * The swap backend. Give it the pool, the tokens and a human amount; it returns
 * a live on-chain quote plus the exact transaction the wallet has to sign.
 *
 * It never signs or sends anything — building the calldata is as far as the
 * server goes. Execution happens in the browser with the user's own key.
 *
 * Body: {
 *   pairAddress: string        pool address (20-byte) or v4 pool id (32-byte)
 *   tokenIn: string            ERC-20 being sold
 *   tokenOut: string           ERC-20 being bought
 *   amountIn: string           human units, e.g. "25" or "0.0042"
 *   slippageBps?: number       default 100 (1%)
 *   recipient?: string         include the unsigned tx in the response
 * }
 */
import { parseUnits, type Address, type Hex } from "viem";
import {
  applySlippage,
  buildV3Swap,
  buildV4Swap,
  findPoolKeyFromLogs,
  quoteV3,
  quoteV4,
  readDecimals,
  recoverPoolKey,
  resolveVenue,
} from "@/lib/arc-swap";
import { UNISWAP_ARC } from "@/lib/arc-chain";
import { jsonWithBigInt } from "@/lib/json-bigint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const POOLID = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonWithBigInt({ error: "invalid JSON body" }, { status: 400 });
  }

  const pairAddress = String(body.pairAddress ?? "");
  const tokenIn = String(body.tokenIn ?? "");
  const tokenOut = String(body.tokenOut ?? "");
  const amountInStr = String(body.amountIn ?? "");
  const slippageBps = Number(body.slippageBps ?? 100);
  const createdAtMs = typeof body.createdAtMs === "number" ? body.createdAtMs : undefined;
  const recipient = body.recipient ? String(body.recipient) : undefined;

  if (!ADDR.test(tokenIn) || !ADDR.test(tokenOut)) {
    return jsonWithBigInt({ error: "tokenIn/tokenOut must be 20-byte addresses" }, { status: 400 });
  }
  if (!ADDR.test(pairAddress) && !POOLID.test(pairAddress)) {
    return jsonWithBigInt({ error: "pairAddress must be a 20-byte pool or a 32-byte v4 pool id" }, { status: 400 });
  }
  if (recipient && !ADDR.test(recipient)) {
    return jsonWithBigInt({ error: "recipient must be a 20-byte address" }, { status: 400 });
  }
  if (!/^\d*\.?\d+$/.test(amountInStr)) {
    return jsonWithBigInt({ error: "amountIn must be a positive decimal string" }, { status: 400 });
  }

  try {
    const venue = await resolveVenue(pairAddress as Address);
    const decimalsIn = await readDecimals(tokenIn as Address);
    const amountIn = parseUnits(amountInStr, decimalsIn);
    if (amountIn <= BigInt(0)) return jsonWithBigInt({ error: "amountIn rounds to zero" }, { status: 400 });

    if (venue.venue === "uniswap-v3") {
      const fee = venue.fee!;
      const { amountOut, gasEstimate } = await quoteV3({
        tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, fee, amountIn,
      });
      const minAmountOut = applySlippage(amountOut, slippageBps);
      const res: Record<string, unknown> = {
        venue: venue.venue, venueLabel: venue.label, fee,
        tokenIn, tokenOut, decimalsIn, amountIn: amountIn.toString(),
        amountOut: amountOut.toString(), minAmountOut: minAmountOut.toString(),
        gasEstimate: gasEstimate.toString(), slippageBps,
        spender: UNISWAP_ARC.v3SwapRouter02,
        approvalRequired: true,
        executable: true,
      };
      if (recipient) {
        res.tx = buildV3Swap({
          tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, fee,
          recipient: recipient as Address, amountIn, minAmountOut,
        });
      }
      return jsonWithBigInt(res);
    }

    if (venue.venue === "uniswap-v4") {
      // Two ways in. Hashing the candidates covers ordinary pools instantly;
      // hooked pools (launchpads attach a hook) can only be resolved by reading
      // the PoolKey the PoolManager published when the pool was initialized.
      let poolKey = recoverPoolKey({
        poolId: pairAddress as Hex,
        tokenA: tokenIn as Address,
        tokenB: tokenOut as Address,
      });
      let keySource = "hash";
      if (!poolKey) {
        poolKey = await findPoolKeyFromLogs({ poolId: pairAddress as Hex, createdAtMs });
        keySource = "logs";
      }
      if (!poolKey) {
        return jsonWithBigInt({
          error: "v4 pool key not recoverable",
          detail: "Neither the fee/tickSpacing candidates nor the PoolManager's Initialize event yielded this pool's key, so it may not be a Uniswap v4 pool at all.",
          poolId: pairAddress,
        }, { status: 422 });
      }
      const zeroForOne = poolKey.currency0.toLowerCase() === tokenIn.toLowerCase();
      const { amountOut, gasEstimate } = await quoteV4({ poolKey, zeroForOne, amountIn });
      const minAmountOut = applySlippage(amountOut, slippageBps);
      const res: Record<string, unknown> = {
        venue: venue.venue, venueLabel: venue.label, keySource,
        poolKey: { ...poolKey, fee: poolKey.fee, tickSpacing: poolKey.tickSpacing },
        zeroForOne,
        tokenIn, tokenOut, decimalsIn, amountIn: amountIn.toString(),
        amountOut: amountOut.toString(), minAmountOut: minAmountOut.toString(),
        gasEstimate: gasEstimate.toString(), slippageBps,
        spender: UNISWAP_ARC.permit2,
        approvalRequired: true,
        note: "Input is pulled through Permit2 — approve Permit2 on tokenIn first.",
        /**
         * Verified live: Arc's UniversalRouter (both deployments) rejects every
         * standard command (v3 AND v4, hookless AND hooked) with allowances and
         * balances in place, while SwapRouter02 executes v3 fine. It is a custom
         * router build — direct v4 execution on Arc is not supported.
         */
        executable: false,
        executionNote: "This pool is Uniswap v4. Arc's UniversalRouter is a custom build that rejects direct swaps, so this pair can't be executed in-app — trade it on an Arc-native DEX UI (e.g. Peach) instead.",
      };
      if (recipient) {
        res.tx = buildV4Swap({
          poolKey, zeroForOne, amountIn, minAmountOut,
          recipient: recipient as Address,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
        });
      }
      return jsonWithBigInt(res);
    }

    return jsonWithBigInt({
      error: "unsupported venue",
      venue: venue.venue, venueLabel: venue.label,
      detail: venue.venue === "aero"
        ? "This pool belongs to Aero (0xb89D…1d03), a v3-compatible fork whose router address is not yet pinned. Uniswap pools work today."
        : "Could not identify the protocol behind this pool.",
    }, { status: 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithBigInt({ error: "quote failed", detail: message.slice(0, 400) }, { status: 502 });
  }
}
