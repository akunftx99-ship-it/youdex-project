/**
 * Portfolio reader — straight from Arc's RPC, no third-party indexer.
 *
 * Multicall3 is deployed on Arc (0xcA11bde05…), so every `balanceOf` in the
 * app's token catalog goes out as ONE eth_call. Prices come from the same Peach
 * feed the market table already uses; anything the feed does not price falls
 * back to the catalog's static number. Typical latency: one RPC round trip.
 */
import { formatUnits, getAddress, type Address } from "viem";
import { ARC_TOKENS } from "./arc-chain";

/** ERC-20 USDC — the quote currency of every Arc pool. */
const USDC: string = ARC_TOKENS.USDC;
import { ARC_EVERY, ARC_HOT, type ArcToken } from "./arc-data";
import { fetchArcStats } from "./arc-live";
import { ArcRpcUnavailableError, arcClient } from "./arc-rpc";

/** Multicall3 on Arc — batched reads in a single eth_call. */
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export type PortfolioItem = {
  address: string;
  symbol: string;
  name: string;
  /** Human balance string, already scaled by the token's decimals. */
  balance: string;
  balanceRaw: string;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  /** Real token logo (Peach feed → IPFS), or the catalog's, or null → gradient. */
  image: string | null;
  /** Catalog entry when the token is one the app lists (drives the mark icon). */
  token: ArcToken | null;
};

export type ArcPortfolio = {
  address: string;
  /** Sum of every holding, valued in USD. */
  totalUsd: number;
  /** USDC only — the number the Fund page shows big. */
  usdcBalance: string;
  items: PortfolioItem[];
  pricedCount: number;
  unpricedCount: number;
  updatedAt: number;
};

function client() {
  return arcClient();
}

/** Catalog (plus USDC) deduped by address — the set the wallet is probed for. */
function portfolioTokens(): Array<{ address: Address; token: ArcToken | null }> {
  const byAddress = new Map<string, ArcToken | null>();
  // USDC first, keeping its catalog entry when the app lists it (icon, name).
  byAddress.set(USDC.toLowerCase(), ARC_EVERY.find((t) => t.address.toLowerCase() === USDC.toLowerCase()) ?? null);
  for (const token of ARC_EVERY) {
    const key = token.address.toLowerCase();
    if (!byAddress.has(key)) byAddress.set(key, token);
  }
  return [...byAddress.entries()].map(([address, token]) => ({ address: address as Address, token }));
}

/**
 * Short-lived memo. Clients poll every 25s, but two pages (Dashboard and Fund)
 * can ask for the same wallet within a second, and every miss costs an eth_call
 * against an endpoint that throttles.
 */
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: ArcPortfolio }>();

export async function readArcPortfolio(walletInput: string): Promise<ArcPortfolio> {
  const key = walletInput.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const wallet = getAddress(walletInput);
  const c = client();
  const tokens = portfolioTokens();

  const [balances, decimals, stats] = await Promise.all([
    c.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: true,
      contracts: tokens.map((t) => ({ address: t.address, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [wallet] as const })),
    }),
    c.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: true,
      contracts: tokens.map((t) => ({ address: t.address, abi: ERC20_ABI, functionName: "decimals" as const })),
    }),
    fetchArcStats([...new Set([...tokens.map((t) => t.address.toLowerCase()), ...ARC_HOT.map((t) => t.address.toLowerCase())])]).catch(() => ({} as Awaited<ReturnType<typeof fetchArcStats>>)),
  ]);

  // A dead RPC must not read as a zero balance. viem only reports per-call
  // failure when the endpoint answered at all; if nothing came back, say so.
  const answered = balances.filter((b) => b.status === "success").length;
  if (answered === 0) {
    throw new ArcRpcUnavailableError("balance sweep returned no answers");
  }

  const items: PortfolioItem[] = [];
  let pricedCount = 0;
  let unpricedCount = 0;
  let usdcBalance = "0";

  tokens.forEach((entry, i) => {
    const raw = balances[i]?.status === "success" ? (balances[i].result as bigint) : 0n;
    if (raw === 0n) return;
    const dp = decimals[i]?.status === "success" ? Number(decimals[i].result) : 18;
    const symbol = entry.token?.symbol ?? (entry.address.toLowerCase() === USDC.toLowerCase() ? "USDC" : "TOKEN");
    const name = entry.token?.name ?? (symbol === "USDC" ? "USD Coin" : symbol);
    const live = stats[entry.address.toLowerCase()]?.price;
    const priceUsd = typeof live === "number" && Number.isFinite(live) && live > 0 ? live : (entry.token?.price ?? 0);
    if (priceUsd > 0) pricedCount++; else unpricedCount++;
    const balance = formatUnits(raw, dp);
    const image = stats[entry.address.toLowerCase()]?.logo ?? entry.token?.image ?? null;
    if (entry.address.toLowerCase() === USDC.toLowerCase()) usdcBalance = balance;
    items.push({
      address: entry.address,
      symbol,
      name,
      balance,
      balanceRaw: raw.toString(),
      decimals: dp,
      priceUsd,
      valueUsd: Number(balance) * priceUsd,
      image,
      token: entry.token,
    });
  });

  items.sort((a, b) => b.valueUsd - a.valueUsd);
  const result: ArcPortfolio = {
    address: wallet,
    totalUsd: items.reduce((sum, item) => sum + item.valueUsd, 0),
    usdcBalance,
    items,
    pricedCount,
    unpricedCount,
    updatedAt: Date.now(),
  };
  cache.set(key, { at: Date.now(), value: result });
  return result;
}

/** Trim a formatted balance for display: 6 sig-ish, no exponent surprises. */
export function formatPortfolioAmount(balance: string): string {
  const n = Number(balance);
  if (!Number.isFinite(n) || n === 0) return "0.00";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".00");
  if (n >= 0.0001) return n.toFixed(6).replace(/0+$/, "");
  const tiny = n.toFixed(8).replace(/0+$/, "");
  return tiny === "0." ? "<0.00000001" : tiny;
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
