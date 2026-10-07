/**
 * JSON with BigInt support.
 *
 * Every swap value (amountIn, amountOut, minAmountOut, gas) is a bigint — that
 * is the whole point of using them, they do not lose precision on 18-decimal
 * amounts. JSON.stringify throws on bigint, so responses go through here and
 * amounts travel as decimal strings ("25000000"), which is what the client
 * wants anyway: it has to hand them straight to parseUnits/formatUnits.
 */
export function jsonWithBigInt(data: unknown, init?: ResponseInit): Response {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}
