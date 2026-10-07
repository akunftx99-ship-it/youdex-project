/**
 * POST /api/swap/1inch/orders
 *
 * Put a signed 1inch limit order onto the orderbook. The signature comes from
 * the user's own wallet (EIP-712 over the Order struct); this route only
 * verifies the key and forwards. Returns the orderHash.
 *
 * Body: { order: {salt, maker, receiver, makerAsset, takerAsset, makingAmount,
 *                  takingAmount, makerTraits}, signature: "0x…" }
 */
import { jsonWithBigInt } from "@/lib/json-bigint";
import { inchCreateOrder, type InchOrder } from "@/lib/one-inch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX = /^0x[0-9a-fA-F]+$/;

export async function POST(req: Request) {
  let body: { order?: InchOrder; signature?: string };
  try {
    body = await req.json();
  } catch {
    return jsonWithBigInt({ error: "invalid JSON body" }, { status: 400 });
  }

  const { order, signature } = body;
  if (!order || !signature || !HEX.test(signature)) {
    return jsonWithBigInt({ error: "order and a hex signature are required" }, { status: 400 });
  }
  const need: Array<keyof InchOrder> = ["salt", "maker", "receiver", "makerAsset", "takerAsset", "makingAmount", "takingAmount", "makerTraits"];
  for (const k of need) {
    if (order[k] === undefined || order[k] === null) {
      return jsonWithBigInt({ error: `order.${k} is required` }, { status: 400 });
    }
  }

  try {
    const res = await inchCreateOrder({ order, signature: signature as `0x${string}` });
    return jsonWithBigInt(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonWithBigInt({ error: "orderbook rejected the order", detail: message.slice(0, 400) }, {
      status: message.includes("INCH_API_KEY") ? 503 : 502,
    });
  }
}