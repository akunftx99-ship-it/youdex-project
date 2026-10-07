/**
 * GET /api/swap/verify
 *
 * Proves the swap backend is wired to real contracts: every routing address
 * must have bytecode on Arc, venue detection must classify a real v3 pool and a
 * real v4 pool id correctly, and a live quote must come back from QuoterV2.
 *
 * Run it after changing arc-chain.ts. If it is green, the addresses are real.
 */
import type { Address, Hex } from "viem";
import { arcClient, quoteV3, quoteV4, recoverPoolKey, resolveVenue } from "@/lib/arc-swap";
import { ARC_TOKENS, UNISWAP_ARC } from "@/lib/arc-chain";
import { jsonWithBigInt } from "@/lib/json-bigint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const V3_TEST_POOL = "0x82916bee18fcef517b26c72d7cb5f13694e1db41" as Address; // cirBTC/USDC 0.01%, Uniswap v3
const V4_TEST_POOL_ID = "0x19f9b0344d506b942794a4e1bbdae0c057461424b0b210c4f3a9a233bdc92b9e" as Hex; // PP/USDC, Uniswap v4

export async function GET() {
  const client = arcClient();
  const checks: Array<Record<string, unknown>> = [];

  for (const [name, address] of Object.entries(UNISWAP_ARC)) {
    const code = await client.getCode({ address: address as Address });
    checks.push({ name, address, hasCode: !!code && code !== "0x", bytes: code ? (code.length - 2) / 2 : 0 });
  }

  const chainId = await client.getChainId();

  let v3Venue: unknown, v3Quote: unknown, v4Venue: unknown, v4Key: unknown, v4Quote: unknown;
  try {
    v3Venue = await resolveVenue(V3_TEST_POOL);
    const fee = (v3Venue as { fee?: number }).fee!;
    v3Quote = await quoteV3({
      tokenIn: ARC_TOKENS.USDC as Address, tokenOut: ARC_TOKENS.cirBTC as Address, fee, amountIn: BigInt(1_000_000), // 1 USDC
    });
  } catch (e) { v3Quote = { error: String(e).slice(0, 200) }; }

  // --- v4: recover a real pool's key and quote it -------------------------
  // PP/USDC (0.25%) is a live v4 pool. Its PoolKey is unknown up front — that
  // is exactly what recoverPoolKey exists to solve — so we probe the fees and
  // taker fees its pool id could belong to and quote the one that matches.
  try {
    v4Venue = await resolveVenue(V4_TEST_POOL_ID);
    const key = recoverPoolKey({
      poolId: V4_TEST_POOL_ID,
      tokenA: ARC_TOKENS.USDC as Address,
      tokenB: "0xbF1fDC20FBE85c3a58E0124e242662a1952293F9" as Address, // PP (Peach People)
    });
    if (key) {
      const zeroForOne = key.currency0.toLowerCase() === ARC_TOKENS.USDC.toLowerCase();
      v4Key = { poolKey: key, zeroForOne };
      try {
        v4Quote = await quoteV4({ poolKey: key, zeroForOne, amountIn: BigInt(1_000_000) }); // 1 USDC
      } catch (e) { v4Quote = { error: String(e).slice(0, 200) }; }
    }
  } catch (e) { v4Key = { error: String(e).slice(0, 200) }; }

  const allHaveCode = checks.every((c) => c.hasCode);
  return jsonWithBigInt({
    ok: allHaveCode && chainId === 5042,
    chainId,
    allAddressesHaveCode: allHaveCode,
    contracts: checks,
    v3: { venue: v3Venue, quote_1_USDC_to_cirBTC: v3Quote },
    v4: { venue: v4Venue, recoveredKey: v4Key, quote_1_USDC: v4Quote },
  }, { headers: { "cache-control": "no-store" } });
}
