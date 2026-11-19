/**
 * POST /api/demo/arbiter  { order, refundBuyer }
 * Simulated arbiter for demo mode: resolves a disputed order the way the
 * visitor chooses, signed with the real config admin key (DEMO_ARBITER_KEY).
 * The outcome is written to the seller's on-chain record like any ruling.
 */
import { PublicKey } from "@solana/web3.js";
import { resolveDispute } from "@/lib/actions";
import { DemoError, demoRoute, envKey, fetchConfig, programAs } from "@/lib/server/demo";
import { statusOf } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return demoRoute(async () => {
    const { order, refundBuyer } = (await req.json()) as { order?: string; refundBuyer?: boolean };
    let orderKey: PublicKey;
    try {
      orderKey = new PublicKey(order ?? "");
    } catch {
      throw new DemoError("Invalid order address", 400);
    }

    const admin = envKey("DEMO_ARBITER_KEY");
    const program = programAs(admin);
    const config = await fetchConfig(admin);
    if (!config.admin.equals(admin.publicKey)) throw new DemoError("DEMO_ARBITER_KEY is not this marketplace's arbiter", 500);

    const data = await program.account.order.fetch(orderKey);
    if (statusOf(data) !== "disputed") throw new DemoError("This order isn't disputed.");

    const sig = await resolveDispute(program, config, admin.publicKey, orderKey, data, refundBuyer !== false);
    return { sig, status: refundBuyer !== false ? "refunded" : "completed" };
  });
}
