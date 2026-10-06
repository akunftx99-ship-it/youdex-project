/**
 * Shared access to Peach's public ARC data host (https://api.peach.ag).
 *
 * Every upstream read goes through here because the header set and the two
 * response quirks below are the same for every endpoint we use.
 */

export const PEACH_ORIGIN = "https://www.peach.ag";

const BASE_HEADERS: Record<string, string> = {
  accept: "application/json",
  // The CDN intermittently labels a plain body as gzip, which makes undici fail
  // the whole request while inflating it. Ask for identity outright.
  "accept-encoding": "identity",
  origin: PEACH_ORIGIN,
  referer: `${PEACH_ORIGIN}/`,
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

/**
 * Some responses are two JSON documents back to back — the payload and a
 * trailing `{"code":0,"msg":""}` envelope — so `JSON.parse` on the whole body
 * throws "Extra data". Scan for the first balanced top-level object instead.
 */
export function firstJsonObject(text: string): unknown {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("no complete JSON object in upstream response");
}

/** One upstream request, first JSON document only. Throws on transport errors. */
export async function peachJson<T>(
  url: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const hasBody = init?.body !== undefined;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: hasBody ? { ...BASE_HEADERS, "content-type": "application/json" } : BASE_HEADERS,
    body: hasBody ? JSON.stringify(init?.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(init?.timeoutMs ?? 9000),
  });
  if (!res.ok) throw new Error(`peach responded ${res.status}`);
  return firstJsonObject(await res.text()) as T;
}

/** Retry once — the transport glitch above is transient. */
export async function peachJsonRetry<T>(
  url: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await peachJson<T>(url, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("peach request failed");
}
