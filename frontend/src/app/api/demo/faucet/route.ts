/**
 * POST /api/demo/faucet  { wallet }
 * Gives a demo wallet 20 test USDC, plus a little SOL for fees, so trying the
 * app never requires a crypto faucet. Only works when the collateral is the
 * test mint whose mint authority is DEMO_FAUCET_KEY. Rate-limited.
 */
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import { COLLATERAL_MINT } from "@/lib/contracts";
import { DemoError, demoRoute, envKey, serverConnection } from "@/lib/server/demo";
import { allow, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USDC_DRIP = 20_000_000; // 20 test USDC
const USDC_REFILL_BELOW = 10_000_000;
const SOL_DRIP = 0.03 * LAMPORTS_PER_SOL; // rent for share accounts + holds, plus fees
const SOL_REFILL_BELOW = 0.015 * LAMPORTS_PER_SOL;

export async function POST(req: Request) {
  return demoRoute(async () => {
    if (!allow(`faucet:${clientKey(req)}`, 5, 60_000)) throw new DemoError("Slow down: try again in a minute.", 429);
    const body = (await req.json().catch(() => ({}))) as { wallet?: unknown };
    if (typeof body.wallet !== "string" || body.wallet.length > 64) throw new DemoError("Invalid wallet address", 400);
    let owner: PublicKey;
    try {
      owner = new PublicKey(body.wallet);
    } catch {
      throw new DemoError("Invalid wallet address", 400);
    }

    const faucet = envKey("DEMO_FAUCET_KEY");
    const conn = serverConnection();
    const mint = await getMint(conn, COLLATERAL_MINT);
    if (!mint.mintAuthority?.equals(faucet.publicKey)) throw new DemoError("This deployment doesn't use a test mint.", 400);

    const tx = new Transaction();
    if ((await conn.getBalance(owner)) < SOL_REFILL_BELOW) {
      tx.add(SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: owner, lamports: SOL_DRIP }));
    }
    const ata = getAssociatedTokenAddressSync(COLLATERAL_MINT, owner);
    let usdc = 0;
    try {
      usdc = Number((await getAccount(conn, ata)).amount);
    } catch {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, ata, owner, COLLATERAL_MINT));
    }
    if (usdc < USDC_REFILL_BELOW) tx.add(createMintToInstruction(COLLATERAL_MINT, ata, faucet.publicKey, USDC_DRIP));

    if (tx.instructions.length === 0) throw new DemoError("You already have test USDC.");
    const sig = await sendAndConfirmTransaction(conn, tx, [faucet], { commitment: "confirmed" });
    return { sig };
  });
}
