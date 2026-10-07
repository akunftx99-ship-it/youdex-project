"use client";

/**
 * ERC-20 balances for the connected Privy wallet on Arc.
 *
 * The order form needs these for two things it was faking before: the "Avbl"
 * readout (it was the literal string "100.00 USDC") and the percent buttons,
 * which have to size an order against a real balance or they do nothing.
 *
 * Polls slowly — a balance only changes when the trader acts, and the swap
 * flow refreshes it explicitly after a fill.
 */
import { useCallback, useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createPublicClient, http, type Address } from "viem";
import { ARC_RPC_URL, arc } from "@/lib/arc-chain";

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export type TokenBalance = { raw: bigint; decimals: number };

export function useArcBalances(tokens: Array<string | undefined>) {
  const { wallets } = useWallets();
  const address = (wallets.find((w) => w.walletClientType === "privy")?.address ?? wallets[0]?.address) as Address | undefined;
  const [balances, setBalances] = useState<Record<string, TokenBalance>>({});
  const [loading, setLoading] = useState(false);

  const wanted = tokens.filter((t): t is string => !!t);
  const key = wanted.join(",");

  const refresh = useCallback(async () => {
    if (!address || !key) {
      setBalances({});
      return;
    }
    setLoading(true);
    try {
      const client = createPublicClient({ chain: arc, transport: http(ARC_RPC_URL, { timeout: 15_000 }) });
      const out: Record<string, TokenBalance> = {};
      await Promise.all(
        key.split(",").map(async (token) => {
          const [raw, decimals] = await Promise.all([
            client.readContract({ address: token as Address, abi: ERC20, functionName: "balanceOf", args: [address] }).catch(() => 0n),
            client.readContract({ address: token as Address, abi: ERC20, functionName: "decimals" }).catch(() => 18),
          ]);
          out[token] = { raw, decimals: Number(decimals) };
        }),
      );
      setBalances(out);
    } finally {
      setLoading(false);
    }
  }, [address, key]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { balances, walletAddress: address, refresh, loading };
}
