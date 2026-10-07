"use client";

/**
 * Swap + limit orders through the 1inch Aggregation Router on Arc.
 *
 * Market (Buy/Sell click):
 *   quote (1inch) -> approve router if needed -> send the router tx -> receipt
 *
 * Limit (Limit mode):
 *   build an EIP-712 Order, sign it with the user's own key (no gas), submit
 *   to 1inch's orderbook — off-chain until a resolver fills it on-chain.
 *
 * Nothing except the final transactions leaves the user's wallet; the server
 * only relays 1inch's calldata and never sees a private key.
 */
import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseUnits, type Address, type Hex } from "viem";
import { arc } from "@/lib/arc-chain";

export type InchSwapPhase =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "approving"; spender: Address }
  | { kind: "awaiting-approval"; hash: Hex }
  | { kind: "swapping" }
  | { kind: "pending"; hash: Hex }
  | { kind: "signing" }
  | { kind: "placing-order" }
  | { kind: "done"; kind2: "swap" | "order"; hash?: Hex; orderHash?: string; amountOut?: string }
  | { kind: "error"; message: string };

type QuoteResult = { spender: Address; amountOut: string; gasEstimate: string };
type SwapResult = { spender: Address; amountIn: string; tx: { to: Address; data: Hex; value: string } };
type DecimalsResult = { src: string; dst: string; decimals: Record<string, number> };

/** EIP-712 order domain on Arc (from @1inch/limit-order-sdk). */
const ORDER_DOMAIN = {
  name: "1inch Aggregation Router",
  version: "6",
  chainId: 5042,
  verifyingContract: "0xe08cab0828a67291ec4af1fb3e7f867e206a6bda" as Address,
};

const ORDER_TYPES = [
  { name: "salt", type: "uint256" },
  { name: "maker", type: "address" },
  { name: "receiver", type: "address" },
  { name: "makerAsset", type: "address" },
  { name: "takerAsset", type: "address" },
  { name: "makingAmount", type: "uint256" },
  { name: "takingAmount", type: "uint256" },
  { name: "makerTraits", type: "uint256" },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
/** Expiry lives in the top 32 bits of makerTraits; shift a unix timestamp. */
const MAKER_TRAITS_EXPIRY_SHIFT = 224n;

async function post<T>(url: string, body: unknown): Promise<T & { error?: string; detail?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok) {
    const message = data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "request failed");
    throw new Error(message);
  }
  return data;
}

export function useOneInchSwap() {
  const { wallets } = useWallets();
  const [phase, setPhase] = useState<InchSwapPhase>({ kind: "idle" });

  const embedded = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];

  const walletOf = useCallback(async () => {
    if (!embedded) throw new Error("No wallet connected — log in to trade.");
    const provider = await embedded.getEthereumProvider();
    const wc = createWalletClient({ account: embedded.address as Address, chain: arc, transport: custom(provider) });
    try {
      await wc.switchChain({ id: arc.id });
    } catch {
      await wc.addChain({ chain: arc }).catch(() => {});
    }
    return wc;
  }, [embedded]);

  /** Steps 2+ shared by every execution path. */
  const ensureAllowance = useCallback(async (
    wc: Awaited<ReturnType<typeof walletOf>>,
    token: Address,
    spender: Address,
    amountWei: bigint,
  ) => {
    const { arcClient, readAllowance, approveCall } = await import("@/lib/arc-swap");
    const allowance = await readAllowance(embedded!.address as Address, token, spender);
    if (allowance < amountWei) {
      setPhase({ kind: "approving", spender });
      const call = approveCall(token, spender, amountWei);
      const hash = await wc.sendTransaction({ account: embedded!.address as Address, chain: arc, to: call.to, data: call.data, value: 0n });
      setPhase({ kind: "awaiting-approval", hash });
      await arcClient().waitForTransactionReceipt({ hash, timeout: 90_000 });
    }
  }, [embedded]);

  const marketSwap = useCallback(async (args: {
    tokenIn: Address; tokenOut: Address; amountIn: string; slippageBps?: number;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      setPhase({ kind: "quoting" });
      const wc = await walletOf();

      const { arcClient } = await import("@/lib/arc-swap");
      const decimals = await post<DecimalsResult>("/api/swap/1inch", {
        action: "decimals", src: args.tokenIn, dst: args.tokenOut,
      });
      const amountWei = parseUnits(args.amountIn, decimals.decimals[args.tokenIn]);

      const q = await post<QuoteResult>("/api/swap/1inch", {
        action: "quote", src: args.tokenIn, dst: args.tokenOut, amountIn: args.amountIn,
      });
      if (q.amountOut === "0") throw new Error("1inch returned a zero quote — is there liquidity for this pair?");

      await ensureAllowance(wc, args.tokenIn, q.spender, amountWei);

      setPhase({ kind: "swapping" });
      const s = await post<SwapResult>("/api/swap/1inch", {
        action: "swap", src: args.tokenIn, dst: args.tokenOut,
        amountIn: args.amountIn, from: embedded!.address, slippageBps: args.slippageBps ?? 100,
      });
      const hash = await wc.sendTransaction({
        account: embedded!.address as Address, chain: arc,
        to: s.tx.to, data: s.tx.data, value: BigInt(s.tx.value || "0"),
      });
      setPhase({ kind: "pending", hash });
      const receipt = await arcClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error("The swap reverted on-chain. Nothing was swapped.");
      setPhase({ kind: "done", kind2: "swap", hash, amountOut: q.amountOut });
      return { ok: true };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.includes("User rejected") || raw.includes("denied") ? "Rejected in the wallet." : raw.slice(0, 300);
      setPhase({ kind: "error", message });
      return { ok: false, error: message };
    }
  }, [walletOf, ensureAllowance, embedded]);

  const placeLimitOrder = useCallback(async (args: {
    /** The token being offered (the "spend" side). */
    makerAsset: Address;
    /** The token wanted back. */
    takerAsset: Address;
    /** Human amount of makerAsset. */
    makingAmount: string;
    /** Human amount of takerAsset requested. */
    takingAmount: string;
    /** Hours until the order expires (default 720 = 30 days). */
    expiresInHours?: number;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      setPhase({ kind: "signing" });
      const wc = await walletOf();

      const dec = await post<DecimalsResult>("/api/swap/1inch", {
        action: "decimals", src: args.makerAsset, dst: args.takerAsset,
      });
      const makingWei = parseUnits(args.makingAmount, dec.decimals[args.makerAsset]);
      const takingWei = parseUnits(args.takingAmount, dec.decimals[args.takerAsset]);
      if (makingWei <= 0n || takingWei <= 0n) throw new Error("order amounts round to zero");

      const expiry = BigInt(Math.floor(Date.now() / 1000) + (args.expiresInHours ?? 720) * 3600);
      const salt = BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));
      const order = {
        salt: salt.toString(),
        maker: embedded!.address as Address,
        receiver: ZERO,
        makerAsset: args.makerAsset,
        takerAsset: args.takerAsset,
        makingAmount: makingWei.toString(),
        takingAmount: takingWei.toString(),
        makerTraits: (expiry << MAKER_TRAITS_EXPIRY_SHIFT).toString(),
      };

      const signature = await wc.signTypedData({
        account: embedded!.address as Address,
        domain: ORDER_DOMAIN,
        types: { Order: ORDER_TYPES },
        primaryType: "Order",
        message: { ...order, salt: salt, maker: order.maker as Address, receiver: order.receiver as Address, makerAsset: order.makerAsset as Address, takerAsset: order.takerAsset as Address, makingAmount: makingWei, takingAmount: takingWei, makerTraits: expiry << MAKER_TRAITS_EXPIRY_SHIFT },
      });

      setPhase({ kind: "placing-order" });
      const res = await post<{ orderHash: string }>("/api/swap/1inch/orders", { order, signature });
      setPhase({ kind: "done", kind2: "order", orderHash: res.orderHash });
      return { ok: true };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.includes("User rejected") || raw.includes("denied") ? "Rejected in the wallet." : raw.slice(0, 300);
      setPhase({ kind: "error", message });
      return { ok: false, error: message };
    }
  }, [walletOf, embedded]);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { marketSwap, placeLimitOrder, phase, reset, walletAddress: embedded?.address as Address | undefined, hasWallet: !!embedded };
}