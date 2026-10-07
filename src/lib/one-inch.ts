/**
 * Server-side 1inch integration (Arc, chain 5042).
 *
 * The 1inch API needs a key (`INCH_API_KEY` in .env.local, server-side only —
 * never NEXT_PUBLIC, never imported from a "use client" file). Quotes and swap
 * calldata come from their Swap API, limit orders go to their Orderbook API.
 *
 * Addresses were pulled from @1inch/limit-order-sdk (ONE_INCH_LIMIT_ORDER_V4_ARC)
 * and verified to carry 24,574 bytes of bytecode on Arc — the router and the
 * limit-order protocol share one address on Arc, exactly like on the other
 * plain EVM networks.
 */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { arc, ARC_RPC_URL } from "./arc-chain";

export const INCH_CHAIN_ID = 5042;

/** 1inch Aggregation Router v6 == LimitOrderProtocol v4 on Arc (one address). */
export const INCH_ROUTER = "0xe08cab0828a67291ec4af1fb3e7f867e206a6bda" as Address;

export const INCH_SWAP_API = "https://api.1inch.dev/swap/v6.1";
export const INCH_ORDERBOOK_API = "https://api.1inch.dev/orderbook/v1.0";

export class InchApiKeyMissingError extends Error {
  constructor() {
    super("INCH_API_KEY is not set in .env.local — add it from portal.1inch.dev (free) and restart the dev server.");
    this.name = "InchApiKeyMissingError";
  }
}

export function inchKey(): string {
  const key = process.env.INCH_API_KEY;
  if (!key) throw new InchApiKeyMissingError();
  return key;
}

async function inchGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${inchKey()}` }, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`1inch API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

let _spender: Address | null = null;

/** The router address the user must approve before a swap. Fetched once from
 *  1inch and cached — it is INCH_ROUTER on Arc, but the API is the source of
 *  truth and this never has to guess. */
export async function inchSpender(): Promise<Address> {
  if (_spender) return _spender;
  const r = await inchGet<{ address: string }>(`${INCH_SWAP_API}/${INCH_CHAIN_ID}/approve/spender`);
  _spender = r.address as Address;
  return _spender;
}

export type InchQuote = {
  srcToken: Address;
  dstToken: Address;
  srcAmount: string;     // wei of src
  dstAmount: string;     // wei of dst — what you actually receive
  estimatedGas: string;
  protocols?: unknown[];
};

export async function inchQuote(args: { src: Address; dst: Address; amountWei: bigint }): Promise<InchQuote> {
  const p = new URLSearchParams({
    src: args.src, dst: args.dst, amount: args.amountWei.toString(),
  });
  const r = await inchGet<Record<string, string>>(`${INCH_SWAP_API}/${INCH_CHAIN_ID}/quote?${p}`);
  return {
    srcToken: r.srcToken as Address,
    dstToken: r.dstToken as Address,
    srcAmount: r.srcAmount,
    dstAmount: r.dstAmount,
    estimatedGas: r.estimatedGas ?? "0",
  };
}

export type InchSwapTx = {
  to: Address;
  data: Hex;
  value: string;
  from: Address;
};

export async function inchSwapTx(args: {
  src: Address; dst: Address; amountWei: bigint; from: Address; slippageBps: number;
}): Promise<{ tx: InchSwapTx; fees: unknown }> {
  const p = new URLSearchParams({
    src: args.src, dst: args.dst, amount: args.amountWei.toString(),
    from: args.from, slippage: String(args.slippageBps),
    fee: "0", burnFeesOnSwap: "false",
  });
  const r = await inchGet<{ tx: InchSwapTx; fees: unknown }>(`${INCH_SWAP_API}/${INCH_CHAIN_ID}/swap?${p}`);
  return r;
}

/** 1inch's own approve calldata for a token (they may wrap it in their own
 *  structure; returns the raw tx the wallet must sign). */
export async function inchApproveTx(args: { token: Address; amountWei?: bigint }): Promise<{ to: Address; data: Hex; value: string }> {
  const p = new URLSearchParams({ tokenAddress: args.token });
  if (args.amountWei !== undefined) p.set("amount", args.amountWei.toString());
  const r = await inchGet<{ to: Address; data: Hex; value: string }>(
    `${INCH_SWAP_API}/${INCH_CHAIN_ID}/approve/transaction?${p}`,
  );
  return r;
}

export type InchOrder = {
  salt: string;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: string;
  takingAmount: string;
  makerTraits: string;
};

/** PUT a signed EIP-712 order onto 1inch's orderbook. The signature is produced
 *  in the browser with the user's own key; only the verified order is sent. */
export async function inchCreateOrder(args: { order: InchOrder; signature: Hex }): Promise<{ orderHash: string }> {
  const res = await fetch(`${INCH_ORDERBOOK_API}/${INCH_CHAIN_ID}/orders`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${inchKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`1inch orderbook ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<{ orderHash: string }>;
}

/** Decimals for both tokens of a pair — used by the client to convert the
 *  human input into wei before touching either 1inch API. */
export async function inchDecimals(tokens: Address[]): Promise<Record<string, number>> {
  const client = createPublicClient({ chain: arc, transport: http(ARC_RPC_URL, { timeout: 15_000 }) });
  const out: Record<string, number> = {};
  for (const t of tokens) {
    try {
      const d = await client.readContract({ address: t, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "decimals" });
      out[t] = Number(d);
    } catch {
      out[t] = 18;
    }
  }
  return out;
}