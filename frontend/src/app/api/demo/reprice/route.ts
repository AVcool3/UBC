/**
 * POST /api/demo/reprice  { direction: "up" | "down" }
 *
 * DEMO SIMULATION, labelled as such in the UI: the test maker moves its ask by
 * $0.03, signed with the maker's own key through the normal `set_terms`
 * instruction. It shows what a hold is for: anyone holding a price keeps it,
 * while "buy now" with an old max price fails cleanly.
 *
 * It can never change an existing hold — the program stores the held price in
 * the Hold account and only that is used at exercise.
 */
import { BN } from "@coral-xyz/anchor";
import { MAKER, MARKET } from "@/lib/contracts";
import { poolPda } from "@/lib/pda";
import { DemoError, demoRoute, makerKey, programAs } from "@/lib/server/demo";
import { allow, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP = 30_000; // $0.03
// Anyone can press the demo button, so keep the maker's ask in a narrow band
// around where it was seeded ($0.93 ± $0.06) instead of letting visitors walk it anywhere.
const BASE_ASK = 930_000;
const MIN_ASK = BASE_ASK - 60_000;
const MAX_ASK = Math.min(990_000, BASE_ASK + 60_000);

export async function POST(req: Request) {
  return demoRoute(async () => {
    if (!allow(`reprice:${clientKey(req)}`, 6, 60_000) || !allow("reprice:all", 30, 60_000)) {
      throw new DemoError("The maker is repricing too often. Try again in a minute.", 429);
    }
    const body = (await req.json().catch(() => ({}))) as { direction?: unknown };
    if (body.direction !== "up" && body.direction !== "down") throw new DemoError("direction must be up or down", 400);

    const maker = makerKey();
    if (!maker.publicKey.equals(MAKER)) throw new DemoError("Configured maker key doesn't match this deployment.", 503);
    const program = programAs(maker);
    const pool = poolPda(MARKET, maker.publicKey);
    const p = await program.account.pool.fetch(pool);
    const ask = Math.min(MAX_ASK, Math.max(MIN_ASK, p.ask.toNumber() + (body.direction === "up" ? STEP : -STEP)));
    if (ask === p.ask.toNumber()) throw new DemoError("The demo keeps the ask within $0.06 of $0.93; it's already at that limit.");

    const sig = await program.methods
      .setTerms({ ask: new BN(ask), holdRate: p.holdRate, maxHoldSecs: p.maxHoldSecs })
      .accountsPartial({ maker: maker.publicKey, pool })
      .rpc();
    return { sig, ask };
  });
}
