"use client";

/**
 * Market swap through 1inch's AggregationRouter on Arc.
 *
 * The whole order flow: quote (1inch) -> approve the router if needed ->
 * send the router's tx -> wait for the receipt. The wallet signs one tx that
 * goes to 0xe08cab… — the same contract the 1inch Terminal executes swaps with
 * on Arc, now from inside this app.
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
  | { kind: "done"; hash: Hex; amountOut?: string }
  | { kind: "error"; message: string };

type DecimalsResult = { src: string; dst: string; decimals: Record<string, number> };
type QuoteResult = { spender: Address; amountOut: string; gasEstimate: string; executable: boolean };
type SwapResult = { spender: Address; amountIn: string; tx: { to: Address; data: Hex; value: string } };

async function post<T>(url: string, body: unknown): Promise<T & { error?: string; detail?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "request failed"));
  return data;
}

export function useOneInchSwap() {
  const { wallets } = useWallets();
  const [phase, setPhase] = useState<InchSwapPhase>({ kind: "idle" });
  const embedded = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];

  const marketSwap = useCallback(async (args: {
    tokenIn: Address; tokenOut: Address; amountIn: string; slippageBps?: number;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      setPhase({ kind: "quoting" });
      if (!embedded) throw new Error("No wallet connected — log in to trade.");
      const provider = await embedded.getEthereumProvider();
      const wc = createWalletClient({ account: embedded.address as Address, chain: arc, transport: custom(provider) });
      try { await wc.switchChain({ id: arc.id }); } catch { await wc.addChain({ chain: arc }).catch(() => {}); }

      const { arcClient, readAllowance, approveCall } = await import("@/lib/arc-swap");
      const decimals = await post<DecimalsResult>("/api/swap/1inch", { action: "decimals", src: args.tokenIn, dst: args.tokenOut });
      const amountWei = parseUnits(args.amountIn, decimals.decimals[args.tokenIn]);

      const q = await post<QuoteResult>("/api/swap/1inch", { action: "quote", src: args.tokenIn, dst: args.tokenOut, amountIn: args.amountIn });
      if (q.amountOut === "0") throw new Error("1inch returned a zero quote.");
      if (q.executable === false) throw new Error("This pair cannot be swapped through 1inch right now.");

      // single ERC-20 approve to their router (0xe08cab… on Arc)
      const allowance = await readAllowance(embedded.address as Address, args.tokenIn, q.spender);
      if (allowance < amountWei) {
        setPhase({ kind: "approving", spender: q.spender });
        const call = approveCall(args.tokenIn, q.spender, amountWei);
        const approveHash = await wc.sendTransaction({ account: embedded.address as Address, chain: arc, to: call.to, data: call.data, value: 0n });
        setPhase({ kind: "awaiting-approval", hash: approveHash });
        await arcClient().waitForTransactionReceipt({ hash: approveHash, timeout: 90_000 });
      }

      setPhase({ kind: "swapping" });
      const s = await post<SwapResult>("/api/swap/1inch", {
        action: "swap", src: args.tokenIn, dst: args.tokenOut,
        amountIn: args.amountIn, from: embedded.address, slippageBps: args.slippageBps ?? 30,
      });
      const hash = await wc.sendTransaction({
        account: embedded.address as Address, chain: arc,
        to: s.tx.to, data: s.tx.data, value: BigInt(s.tx.value || "0"),
      });
      setPhase({ kind: "pending", hash });
      const receipt = await arcClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") {
        const message = `The swap reverted on-chain (tx ${hash}). Only gas was spent.`;
        setPhase({ kind: "error", message });
        return { ok: false, error: message };
      }
      setPhase({ kind: "done", hash, amountOut: q.amountOut });
      return { ok: true };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.includes("User rejected") || raw.includes("denied") ? "Rejected in the wallet." : raw.slice(0, 300);
      setPhase({ kind: "error", message });
      return { ok: false, error: message };
    }
  }, [embedded]);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);
  return { marketSwap, phase, reset, walletAddress: embedded?.address as Address | undefined, hasWallet: !!embedded };
}