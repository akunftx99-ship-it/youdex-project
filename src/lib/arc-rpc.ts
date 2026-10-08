import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { ARC_CHAIN_ID, ARC_RPC_URL, arc } from "./arc-chain";

/**
 * The one Arc RPC client for the whole app (server routes and wallet hooks).
 *
 * Arc's hosted endpoint rate-limits hard — Cloudflare's shared egress IPs get
 * throttled almost immediately, which showed up in production as
 * `LimitExceededRpcError: rate limit exceeded` and, worse, as a confident
 * $0.00 portfolio.
 *
 * Three defences:
 *   1. a fallback transport across independently operated endpoints, so a
 *      throttle on one is answered by another (all three report chainId 5042);
 *   2. a retry with a short delay per endpoint, absorbing the brief windows
 *      this endpoint enforces;
 *   3. a process-wide singleton, so every route in a Worker isolate shares one
 *      client instead of building a new one per request.
 */
const ENDPOINTS = [
  ARC_RPC_URL,
  "https://arc-rpc.publicnode.com",
  "https://arc.drpc.org",
];

let _client: PublicClient | null = null;

export function arcClient(): PublicClient {
  if (!_client) {
    _client = createPublicClient({
      chain: arc,
      transport: fallback(
        ENDPOINTS.map((url) => http(url, { timeout: 20_000, retryCount: 1, retryDelay: 300 })),
        // `rank: false` keeps the configured order: our own endpoint first, the
        // mirrors only once it stops answering.
        { rank: false },
      ),
      batch: { multicall: true },
    });
  }
  return _client;
}

/** Raised when no endpoint answered — callers must not read it as "zero". */
export class ArcRpcUnavailableError extends Error {
  constructor(detail: string) {
    super(`Arc RPC unavailable: ${detail}`);
    this.name = "ArcRpcUnavailableError";
  }
}

/** The chain id every endpoint must agree on; exported for the verify route. */
export const ARC_EXPECTED_CHAIN_ID = ARC_CHAIN_ID;
