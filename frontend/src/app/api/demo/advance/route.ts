/**
 * POST /api/demo/advance  { order }
 * Autopilot for the other side of a purchase, so one person can try the full flow:
 *   Paid    → the demo seller marks it shipped (signed with that seller's key)
 *   Shipped → the carrier confirms delivery (signed with the carrier key)
 * Sellers NOT in DEMO_SELLER_KEYS (e.g. FlashDeals99) never ship — on purpose,
 * so you can see the automatic refund.
 */
import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { confirmDelivery, markShipped } from "@/lib/actions";
import { DemoError, demoRoute, envKey, envKeyList, programAs } from "@/lib/server/demo";
import { statusOf } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return demoRoute(async () => {
    const { order } = (await req.json()) as { order?: string };
    let orderKey: PublicKey;
    try {
      orderKey = new PublicKey(order ?? "");
    } catch {
      throw new DemoError("Invalid order address", 400);
    }

    const carrier = envKey("DEMO_CARRIER_KEY");
    const data = await programAs(carrier).account.order.fetch(orderKey);
    const status = statusOf(data);

    if (status === "paid") {
      const seller = envKeyList("DEMO_SELLER_KEYS").find((k) => k.publicKey.equals(data.sellerAuthority));
      if (!seller) {
        throw new DemoError("This seller isn't on autopilot and won't ship. Wait for the deadline, then take your refund.");
      }
      const trackingHash = [...createHash("sha256").update(`DEMO-${orderKey.toBase58()}`).digest()];
      const sig = await markShipped(programAs(seller), seller.publicKey, orderKey, trackingHash);
      return { sig, status: "shipped" };
    }

    if (status === "shipped") {
      const sig = await confirmDelivery(programAs(carrier), carrier.publicKey, orderKey);
      return { sig, status: "delivered" };
    }

    throw new DemoError(`Nothing to simulate for an order that is ${status}.`);
  });
}
