/**
 * Server-side 1inch integration for Arc (chain 5042), key from .env.local.
 *
 * The swap executes on 1inch's AggregationRouter — 0xe08cab…6bda on Arc (the
 * spender the API itself reports, and the address a real 1inch terminal swap on
 * Arc was confirmed to hit). Quotes and calldata come from their Swap API; the
 * browser wallet signs and pays for the single router tx.
 */
import { type Address, type Hex } from "viem";
import { arcClient } from "./arc-rpc";

export const INCH_CHAIN_ID = 5042;
export const INCH_SWAP_API = "https://api.1inch.dev/swap/v6.1";

export class InchApiKeyMissingError extends Error {
  constructor() {
    super("INCH_API_KEY is missing from .env.local");
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
  if (!res.ok) throw new Error(`1inch API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

let _spender: Address | null = null;

/** The router the user must approve — from 1inch's own mouth, cached. */
export async function inchSpender(): Promise<Address> {
  if (_spender) return _spender;
  const r = await inchGet<{ address: string }>(`${INCH_SWAP_API}/${INCH_CHAIN_ID}/approve/spender`);
  _spender = r.address as Address;
  return _spender;
}

export async function inchQuote(args: { src: Address; dst: Address; amountWei: bigint }): Promise<{ dstAmount: string; estimatedGas?: string }> {
  const p = new URLSearchParams({ src: args.src, dst: args.dst, amount: args.amountWei.toString() });
  return inchGet(`${INCH_SWAP_API}/${INCH_CHAIN_ID}/quote?${p}`);
}

export async function inchSwapTx(args: {
  src: Address; dst: Address; amountWei: bigint; from: Address; slippageBps: number;
}): Promise<{ tx: { to: Address; data: Hex; value: string }; fees?: unknown }> {
  const p = new URLSearchParams({
    src: args.src, dst: args.dst, amount: args.amountWei.toString(),
    from: args.from, slippage: String(args.slippageBps),
    fee: "0", burnFeesOnSwap: "false",
  });
  return inchGet(`${INCH_SWAP_API}/${INCH_CHAIN_ID}/swap?${p}`);
}

export async function inchDecimals(tokens: Address[]): Promise<Record<string, number>> {
  const client = arcClient();
  const out: Record<string, number> = {};
  for (const t of tokens) {
    try {
      out[t] = Number(await client.readContract({ address: t, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "decimals" }));
    } catch { out[t] = 18; }
  }
  return out;
}