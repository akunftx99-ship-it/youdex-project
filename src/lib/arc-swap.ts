/**
 * The swap engine: everything needed to turn "sell 25 USDC for PP" into a
 * transaction the wallet can sign.
 *
 * Design rules:
 *  - Quotes always come from the chain (QuoterV2 / V4Quoter), never from a
 *    price feed, so the min-out we compute is what the pool will actually pay.
 *  - Nothing here sends a transaction. It returns { to, data, value } and the
 *    caller decides. That keeps this file importable from a server route and a
 *    client component alike.
 *  - Venue is resolved from the pool itself (factory() / pool-id length), not
 *    from the feed's dex label, which mislabels Arc pools.
 */
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  ARC_RPC_URL,
  ARC_FACTORIES,
  ERC20_ABI,
  UNISWAP_ARC,
  V3_POOL_ABI,
  V3_QUOTER_V2_ABI,
  V3_SWAP_ROUTER_ABI,
  V4_QUOTER_ABI,
  arc,
  type ArcVenue,
} from "./arc-chain";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

let _client: PublicClient | null = null;
export function arcClient(): PublicClient {
  if (!_client) {
    _client = createPublicClient({ chain: arc, transport: http(ARC_RPC_URL, { timeout: 15_000, retryCount: 2 }) });
  }
  return _client;
}

const isPoolId = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

/** Which venue owns this pool. Reads the chain for 20-byte pool contracts;
 *  32-byte ids are Uniswap v4 (a v4 pool id *is* the pair address in feeds). */
export async function resolveVenue(pairAddress: Address): Promise<{ venue: ArcVenue; fee?: number; label: string }> {
  // Shape check comes first: a 32-byte "address" can never be a contract, so
  // asking for its code would fail before we ever get to classify it.
  if (isPoolId(pairAddress)) return { venue: "uniswap-v4", label: "Uniswap V4" };

  const client = arcClient();
  const code = await client.getCode({ address: pairAddress });
  if (!code || code === "0x") return { venue: "unknown", label: "Unknown" };

  try {
    const [factory, fee] = await Promise.all([
      client.readContract({ address: pairAddress, abi: V3_POOL_ABI, functionName: "factory" }),
      client.readContract({ address: pairAddress, abi: V3_POOL_ABI, functionName: "fee" }),
    ]);
    const known = ARC_FACTORIES[factory.toLowerCase() as keyof typeof ARC_FACTORIES];
    return { venue: known?.venue ?? "unknown", fee: Number(fee), label: known?.label ?? "Unknown" };
  } catch {
    return { venue: "unknown", label: "Unknown" };
  }
}

/** Exact-input quote on a Uniswap v3 pool. QuoterV2 reverts-by-design, so this
 *  goes through eth_call — a successful call *is* the quote. */
export async function quoteV3(args: {
  tokenIn: Address; tokenOut: Address; fee: number; amountIn: bigint;
}): Promise<{ amountOut: bigint; gasEstimate: bigint }> {
  const client = arcClient();
  const { result } = await client.simulateContract({
    address: UNISWAP_ARC.v3QuoterV2 as Address,
    abi: V3_QUOTER_V2_ABI,
    functionName: "quoteExactInputSingle",
    args: [{
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      amountIn: args.amountIn,
      fee: args.fee,
      sqrtPriceLimitX96: 0n,
    }],
  });
  const [amountOut, , , gasEstimate] = result as readonly [bigint, bigint, number, bigint];
  return { amountOut, gasEstimate };
}

/** Uniswap v3 swap calldata for SwapRouter02. */
export function buildV3Swap(args: {
  tokenIn: Address; tokenOut: Address; fee: number;
  recipient: Address; amountIn: bigint; minAmountOut: bigint;
}): { to: Address; data: Hex; value: bigint } {
  const data = encodeFunctionData({
    abi: V3_SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      fee: args.fee,
      recipient: args.recipient,
      amountIn: args.amountIn,
      amountOutMinimum: args.minAmountOut,
      sqrtPriceLimitX96: 0n,
    }],
  });
  return { to: UNISWAP_ARC.v3SwapRouter02 as Address, data, value: 0n };
}

/* ------------------------------------------------------------------ v4 ---- */

const TICK_SPACINGS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 50, 60, 100, 200, 500, 1000, 2000] as const;
const HISTORICAL_FEES = [1, 50, 100, 200, 250, 300, 400, 500, 1000, 2000, 2500, 3000, 4000, 5000, 10000, 15000, 20000, 30000, 50000, 100000] as const;

export function poolKeyId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, uint24, int24, address"), [
      key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks,
    ]),
  );
}

/**
 * Recover the PoolKey behind a v4 pool id.
 *
 * A v4 pool has no address — the feed's "pair address" is keccak256 of the key,
 * which is one-way. But the keyspace is small in practice: fee tiers are a known
 * short list, tick spacing follows the fee tier, and most pools use no hook. So
 * we hash the candidates and look for the match. Returns null when the pool uses
 * a custom key (a hook we can't guess, most likely) — never a wrong key.
 */
export function recoverPoolKey(args: {
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  hooks?: Address;
  /** Restrict the search to these fee tiers. Omit to sweep every known tier —
   *  v4 allows arbitrary fees, so a pool can carry one no list contains. */
  fees?: readonly number[];
}): PoolKey | null {
  const [currency0, currency1] = args.tokenA.toLowerCase() < args.tokenB.toLowerCase()
    ? [args.tokenA, args.tokenB]
    : [args.tokenB, args.tokenA];
  const hookCandidates = args.hooks ? [args.hooks] : [ZERO];
  const target = args.poolId.toLowerCase();

  for (const hooks of hookCandidates) {
    for (const fee of args.fees ?? HISTORICAL_FEES) {
      for (const tickSpacing of TICK_SPACINGS) {
        const key: PoolKey = { currency0, currency1, fee, tickSpacing, hooks };
        if (poolKeyId(key).toLowerCase() === target) return key;
      }
    }
  }
  return null;
}

export async function quoteV4(args: {
  poolKey: PoolKey; zeroForOne: boolean; amountIn: bigint;
}): Promise<{ amountOut: bigint; gasEstimate: bigint }> {
  const client = arcClient();
  const { result } = await client.simulateContract({
    address: UNISWAP_ARC.v4Quoter as Address,
    abi: V4_QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [{
      poolKey: args.poolKey,
      zeroForOne: args.zeroForOne,
      exactAmount: args.amountIn,
      hookData: "0x",
    }],
  });
  const [amountOut, gasEstimate] = result as readonly [bigint, bigint];
  return { amountOut, gasEstimate };
}

/** UniversalRouter command / v4 action bytes (from @uniswap/universal-router). */
const UR_CMD_V4_SWAP = "10" as const;      // 0x10
const V4_ACTION_SWAP_EXACT_IN_SINGLE = "06" as const;
const V4_ACTION_SETTLE_ALL = "0c" as const;
const V4_ACTION_TAKE_ALL = "0f" as const;

/**
 * Build a v4 exact-input swap for the UniversalRouter:
 *   V4_SWAP[ SWAP_EXACT_IN_SINGLE, SETTLE_ALL(input), TAKE_ALL(output) ]
 * The router pulls the input through Permit2, so the caller must have approved
 * Permit2 for tokenIn first (see `permit2ApprovalCall`).
 */
export function buildV4Swap(args: {
  poolKey: PoolKey;
  zeroForOne: boolean;
  /** Unix seconds; use BigInt(Math.floor(Date.now() / 1000) + 300). */
  deadline: bigint;
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: Address;
}): { to: Address; data: Hex; value: bigint } {
  const { poolKey, zeroForOne, amountIn, minAmountOut } = args;
  const tokenIn = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const tokenOut = zeroForOne ? poolKey.currency1 : poolKey.currency0;

  const swapParams = encodeAbiParameters(
    parseAbiParameters("(address,address,uint24,int24,address), bool, uint128, uint128, bytes"),
    [
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
      zeroForOne,
      amountIn,
      minAmountOut,
      "0x",
    ],
  );
  const settleParams = encodeAbiParameters(parseAbiParameters("address, uint256"), [tokenIn, amountIn]);
  const takeParams = encodeAbiParameters(parseAbiParameters("address, uint256"), [tokenOut, minAmountOut]);

  const actions = `0x${V4_ACTION_SWAP_EXACT_IN_SINGLE}${V4_ACTION_SETTLE_ALL}${V4_ACTION_TAKE_ALL}` as Hex;
  const v4Input = encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [
    actions,
    [swapParams, settleParams, takeParams],
  ]);

  const data = encodeFunctionData({
    abi: [{
      type: "function", name: "execute", stateMutability: "payable",
      inputs: [
        { name: "commands", type: "bytes" },
        { name: "inputs", type: "bytes[]" },
        { name: "deadline", type: "uint256" },
      ],
      outputs: [],
    }],
    functionName: "execute",
    args: [`0x${UR_CMD_V4_SWAP}` as Hex, [v4Input], args.deadline],
  });

  return { to: UNISWAP_ARC.universalRouter as Address, data, value: 0n };
}

/* -------------------------------------------------------------- helpers ---- */

export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 5000) throw new Error("slippage out of range");
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

export async function readDecimals(token: Address): Promise<number> {
  const d = await arcClient().readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" });
  return Number(d);
}

export async function readAllowance(owner: Address, token: Address, spender: Address): Promise<bigint> {
  return arcClient().readContract({
    address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender],
  });
}

/** ERC-20 approve. v3 routes spend through the router directly; v4 (UniversalRouter)
 *  pulls through Permit2, which needs its own approve on the token first. */
export function approveCall(token: Address, spender: Address, amount: bigint): { to: Address; data: Hex; value: bigint } {
  return {
    to: token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] }),
    value: 0n,
  };
}
