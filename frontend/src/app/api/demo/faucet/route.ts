/**
 * POST /api/demo/faucet  { wallet }
 * Gives a demo wallet 20 test USDC, plus a little SOL for fees, so the user
 * never has to think about gas. Only works when the marketplace uses a test
 * USDC mint whose mint authority is DEMO_FAUCET_KEY (set up by init-config).
 */
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import { DemoError, demoRoute, envKey, fetchConfig, serverConnection } from "@/lib/server/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USDC_DRIP = 20_000_000; // 20 test USDC (6 decimals)
const USDC_REFILL_BELOW = 10_000_000; // only refill when under 10 USDC
const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL; // covers ~7 orders' rent + fees
const SOL_REFILL_BELOW = 0.02 * LAMPORTS_PER_SOL;

export async function POST(req: Request) {
  return demoRoute(async () => {
    const { wallet } = (await req.json()) as { wallet?: string };
    let owner: PublicKey;
    try {
      owner = new PublicKey(wallet ?? "");
    } catch {
      throw new DemoError("Invalid wallet address", 400);
    }

    const faucet = envKey("DEMO_FAUCET_KEY");
    const conn = serverConnection();
    const config = await fetchConfig(faucet);
    const mint = await getMint(conn, config.usdcMint);
    if (!mint.mintAuthority?.equals(faucet.publicKey)) {
      throw new DemoError("This deployment uses real devnet USDC. Get some at faucet.circle.com.", 400);
    }

    const tx = new Transaction();

    // 1) Gas: top up SOL silently so fees never block the user.
    if ((await conn.getBalance(owner)) < SOL_REFILL_BELOW) {
      tx.add(SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: owner, lamports: SOL_DRIP }));
    }

    // 2) Test USDC: create their token account if needed, then mint.
    const ata = getAssociatedTokenAddressSync(config.usdcMint, owner);
    let usdc = 0;
    try {
      usdc = Number((await getAccount(conn, ata)).amount);
    } catch {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, ata, owner, config.usdcMint));
    }
    if (usdc < USDC_REFILL_BELOW) {
      tx.add(createMintToInstruction(config.usdcMint, ata, faucet.publicKey, USDC_DRIP));
    }

    if (tx.instructions.length === 0) throw new DemoError("You already have test USDC. Go buy something!");
    const sig = await sendAndConfirmTransaction(conn, tx, [faucet], { commitment: "confirmed" });
    return { sig };
  });
}
