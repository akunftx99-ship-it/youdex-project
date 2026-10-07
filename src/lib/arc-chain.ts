/**
 * Arc mainnet chain definition + the DEX contracts we route through.
 *
 * Every address here was verified against the live chain (eth_chainId -> 5042,
 * eth_getCode -> non-empty) and against Uniswap's own deployment feed
 * (developers.uniswap.org/deployments.json, tier "labs-supported"), not copied
 * from a blog post. If you change one, re-run scripts/verify-arc-contracts.mjs.
 */
import { defineChain } from "viem";

export const ARC_CHAIN_ID = 5042;

export const ARC_RPC_URL = "https://rpc.mainnet.arc.io";

/** Arc's native gas token. The RPC prices gas in wei (~20 gwei), so the native
 *  unit is 18-decimals; the ERC-20 USDC at 0x3600…0000 is a separate 6-decimal
 *  token even though both are "USDC". */
export const arc = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  testnet: false,
});

export const ARC_TOKENS = {
  /** ERC-20 USDC, 6 decimals — the quote currency of every Arc pool. */
  USDC: "0x3600000000000000000000000000000000000000",
  WETH: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB",
  cirBTC: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
} as const;

/** Uniswap on Arc. Source: developers.uniswap.org/deployments.json (chainId 5042). */
export const UNISWAP_ARC = {
  v3Factory: "0xf0db7b58379503491d857dB50AC9ece64c653918",
  v3SwapRouter02: "0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77",
  v3QuoterV2: "0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468",
  v3NftPositionManager: "0x39654A85A4C05127f5Fd6ED22CAeC077A0fB1377",
  v4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  v4Quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  v4PositionManager: "0x6049c9a0e26405C0985f9E3685C87d0aE917f82B",
  v4StateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  universalRouter: "0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1",
  universalRouterV212: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  v2Router02: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
} as const;

/** Third-party Arc factories we can identify from a pool's factory() call.
 *  Kept here so venue resolution is a table lookup, not a guess. */
export const ARC_FACTORIES = {
  /** Uniswap v3 canonical factory — pools here route through v3SwapRouter02. */
  [UNISWAP_ARC.v3Factory.toLowerCase()]: { venue: "uniswap-v3", label: "Uniswap V3" },
  /** Aero (Dromos Labs) v3-style factory, deploys EIP-1167 clone pools with an
   *  unconventional fee tier (WETH/USDC is fee=320). Router not yet identified. */
  "0xb89df768af2cfe637ceb352c587fe8edaf491d03": { venue: "aero", label: "Aero" },
} as const;

export type ArcVenue = "uniswap-v3" | "uniswap-v4" | "aero" | "unknown";

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** Uniswap v3 SwapRouter02 — exactInputSingle (no deadline field; SwapRouter02
 *  drops it and expects a multicall wrapper when one is needed). */
export const V3_SWAP_ROUTER_ABI = [
  {
    type: "function", name: "exactInputSingle", stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple", components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "recipient", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "amountOutMinimum", type: "uint256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function", name: "multicall", stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

export const V3_QUOTER_V2_ABI = [
  {
    type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
    inputs: [{
      name: "params", type: "tuple", components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "fee", type: "uint24" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const V3_POOL_ABI = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
] as const;

/** The PoolKey shape shared by v4 pool id derivation and the UniversalRouter. */
export const V4_POOL_KEY_ABI_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

export const V4_QUOTER_ABI = [
  {
    type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
    inputs: [{
      name: "params", type: "tuple", components: [
        { name: "poolKey", type: "tuple", components: V4_POOL_KEY_ABI_COMPONENTS },
        { name: "zeroForOne", type: "bool" },
        { name: "exactAmount", type: "uint128" },
        { name: "hookData", type: "bytes" },
      ],
    }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
