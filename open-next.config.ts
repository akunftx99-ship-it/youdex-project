import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Minimal Cloudflare config on purpose.
 *
 * The default (no overrides) keeps everything in the Worker: no R2 bucket for
 * the incremental cache, no KV, no D1. That matters here because every bound
 * resource would widen what the deploy token has to be allowed to touch.
 *
 * The app's own caching is already fine without it — /api/prices caches in
 * module scope for 4s and the client polls every 6s.
 */
export default defineCloudflareConfig();
