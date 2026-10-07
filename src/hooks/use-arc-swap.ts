"use client";

/**
 * Runs an Arc swap from the browser with the user's own Privy wallet.
 *
 * Flow, in order, and the whole point of the hook is that each step is a
 * separate transaction the user can see in their wallet:
 *
 *   1. GET  the quote        -> /api/swap/quote  (live QuoterV2 / V4Quoter read)
 *   2. if allowance is short -> approve(router | Permit2) and wait for the receipt
 *   3. send the swap         -> router.exactInputSingle / UniversalRouter.execute
 *   4. wait for the receipt and report the swap
 *
 * The quote is re-fetched with the recipient attached right before sending, so
 * the minAmountOut the router enforces comes from a fresh pool read, not from
 * whatever the UI happened to be showing a minute ago.
 */
import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseUnits, type Address, type Hex } from "viem";
import { arc } from "@/lib/arc-chain";

export type SwapPhase =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "approving"; spender: Address }
  | { kind: "awaiting-approval"; hash: Hex }
  | { kind: "swapping" }
  | { kind: "pending"; hash: Hex }
  | { kind: "done"; hash: Hex; amountOut: string }
  | { kind: "error"; message: string };

type QuoteResponse = {
  venue: string;
  venueLabel: string;
  fee?: number;
  decimalsIn: number;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  spender: Address;
  poolKey?: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
  zeroForOne?: boolean;
  tx?: { to: Address; data: Hex; value: string | number | bigint };
};

export function useArcSwap() {
  const { wallets } = useWallets();
  const [phase, setPhase] = useState<SwapPhase>({ kind: "idle" });

  const embedded = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];

  const swap = useCallback(
    async (args: {
      pairAddress: string;
      tokenIn: Address;
      tokenOut: Address;
      amountIn: string;
      slippageBps?: number;
    }): Promise<{ ok: boolean; hash?: Hex; error?: string }> => {
      if (!embedded) {
        const message = "No wallet connected — log in to trade.";
        setPhase({ kind: "error", message });
        return { ok: false, error: message };
      }

      try {
        setPhase({ kind: "quoting" });
        const provider = await embedded.getEthereumProvider();
        const walletClient = createWalletClient({
          account: embedded.address as Address,
          chain: arc,
          transport: custom(provider),
        });

        // The browser wallet may be sitting on another chain; switch it to Arc.
        try {
          await walletClient.switchChain({ id: arc.id });
        } catch {
          // 4902 = chain unknown to the wallet; add it, then the send below will
          // prompt the switch anyway. Failure here is not fatal, so we continue.
          await walletClient.addChain({ chain: arc }).catch(() => {});
        }

        // 1) quote — no recipient, we only want the numbers
        const quoteRes = await fetch("/api/swap/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pairAddress: args.pairAddress,
            tokenIn: args.tokenIn,
            tokenOut: args.tokenOut,
            amountIn: args.amountIn,
            slippageBps: args.slippageBps ?? 100,
          }),
        });
        const q = (await quoteRes.json()) as QuoteResponse & { error?: string; detail?: string };
        if (!quoteRes.ok) {
          const message = q.detail ? `${q.error}: ${q.detail}` : (q.error ?? "quote failed");
          setPhase({ kind: "error", message });
          return { ok: false, error: message };
        }

        const amountIn = parseUnits(args.amountIn, q.decimalsIn);

        // 2) allowance
        const { arcClient, readAllowance, approveCall } = await import("@/lib/arc-swap");
        const allowance = await readAllowance(embedded.address as Address, args.tokenIn, q.spender);
        if (allowance < amountIn) {
          setPhase({ kind: "approving", spender: q.spender });
          const call = approveCall(args.tokenIn, q.spender, amountIn);
          const approveHash = await walletClient.sendTransaction({
            account: embedded.address as Address,
            chain: arc,
            to: call.to,
            data: call.data,
            value: BigInt(0),
          });
          setPhase({ kind: "awaiting-approval", hash: approveHash });
          await arcClient().waitForTransactionReceipt({ hash: approveHash, timeout: 90_000 });
        }

        // 3) re-quote with the recipient so minAmountOut is enforced on-chain
        const swapRes = await fetch("/api/swap/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pairAddress: args.pairAddress,
            tokenIn: args.tokenIn,
            tokenOut: args.tokenOut,
            amountIn: args.amountIn,
            slippageBps: args.slippageBps ?? 100,
            recipient: embedded.address,
          }),
        });
        const s = (await swapRes.json()) as QuoteResponse & { error?: string; detail?: string };
        if (!swapRes.ok || !s.tx) {
          const message = s.detail ? `${s.error}: ${s.detail}` : (s.error ?? "could not build the swap");
          setPhase({ kind: "error", message });
          return { ok: false, error: message };
        }

        setPhase({ kind: "swapping" });
        const swapHash = await walletClient.sendTransaction({
          account: embedded.address as Address,
          chain: arc,
          to: s.tx.to,
          data: s.tx.data,
          value: BigInt(s.tx.value ?? 0),
        });
        setPhase({ kind: "pending", hash: swapHash });

        const receipt = await arcClient().waitForTransactionReceipt({ hash: swapHash, timeout: 120_000 });
        if (receipt.status !== "success") {
          const message = "The swap reverted on-chain. Nothing was swapped (only gas was spent).";
          setPhase({ kind: "error", message });
          return { ok: false, hash: swapHash, error: message };
        }

        setPhase({ kind: "done", hash: swapHash, amountOut: s.amountOut });
        return { ok: true, hash: swapHash };
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const message = raw.includes("User rejected") || raw.includes("denied")
          ? "Rejected in the wallet."
          : raw.slice(0, 300);
        setPhase({ kind: "error", message });
        return { ok: false, error: message };
      }
    },
    [embedded],
  );

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { swap, phase, reset, walletAddress: embedded?.address as Address | undefined, hasWallet: !!embedded };
}
