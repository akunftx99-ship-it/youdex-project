import { createPublicClient, http } from "viem";
import { ARC_RPC_URL, arc } from "./arc-chain";

/**
 * The one Arc RPC client for server code.
 *
 * Arc's public endpoint rate-limits liberally — and it is especially quick to
 * do so for Cloudflare's shared egress IPs, which is exactly what a deployed
 * Worker looks like (`LimitExceededRpcError: rate limit exceeded`). A single
 * 429 used to surface as an empty result, so the UI showed a confident 0.
 *
 * Two defences here:
 *   - retryCount with a delay, so a throttle becomes a short pause instead of
 *     a failure;
 *   - a module-scope singleton, so every route in an isolate shares one client
 *     (and its connection reuse) rather than building its own per request.
 */
let _client: ReturnType<typeof createPublicClient> | null = null;

export function arcClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: arc,
      transport: http(ARC_RPC_URL, {
        timeout: 20_000,
        // A throttled call is worth another go; three attempts ride out the
        // short windows this endpoint enforces.
        retryCount: 3,
        retryDelay: 400,
      }),
      batch: { multicall: true },
    });
  }
  return _client;
}

/** Raised when the RPC never answered — callers must not read it as "zero". */
export class ArcRpcUnavailableError extends Error {
  constructor(detail: string) {
    super(`Arc RPC unavailable: ${detail}`);
    this.name = "ArcRpcUnavailableError";
  }
}
