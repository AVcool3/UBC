/**
 * Creates every market in ../markets.json on the cluster (idempotent) and gives
 * the demo maker a pool on each, quoted at the Gemini reference ask (public,
 * read-only), then writes the list into ../frontend/src/deployment.json
 * under `markets` (other fields, like the example receipts, are kept).
 *
 *   ANCHOR_WALLET=<funded keypair> npm run seed-markets
 *
 * Roles are the same as seed-market.ts: keys/arbiter.json = admin,
 * keys/faucet.json = test-USDC mint authority, keys/seller-glow.json = maker.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import idl from "../target/idl/held_quote.json";
import type { HeldQuote } from "../target/types/held_quote";
import { getProgram, getProvider, loadOrCreateKeypair, marketPda, noMintPda, poolPda, yesMintPda } from "./common";

type MarketSpec = {
  id: number;
  question: string;
  resolution: string;
  closeTime: string;
  category: string;
  reference: { symbol: string; event: string; label: string };
};

const SPECS: MarketSpec[] = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "markets.json"), "utf8"));
const USDC_MINT = new PublicKey(process.env.USDC_MINT ?? "Crsx17TuZzj6Mna53EsSnLQRPfwXuSYnu3Z8kJvi3vfm");
const SETS = Number(process.env.SETS ?? 300);
const HOLD_RATE = 1_250; // $0.00125 per share-minute (econ normal-regime break-even ≈ $0.00124)
const MAX_HOLD_SECS = 60;
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
// The free devnet RPC rate-limits bursts; pause between steps.
const pace = () => new Promise((r) => setTimeout(r, Number(process.env.PACE_MS ?? 2500)));

/** Gemini best ask, rounded UP to the $0.01 tick, clamped to [0.02, 0.98]. Public read-only GET. */
async function referenceAsk(symbol: string): Promise<{ ask: number; note: string }> {
  try {
    const res = await fetch(`https://api.gemini.com/v1/book/${encodeURIComponent(symbol)}?limit_bids=1&limit_asks=1`);
    const book = (await res.json()) as { asks?: { price: string }[] };
    const best = Number(book.asks?.[0]?.price);
    if (best > 0 && best < 1) {
      const cents = Math.min(98, Math.max(2, Math.ceil(best * 100)));
      return { ask: cents * 10_000, note: `Gemini best ask ${best} at ${new Date().toISOString()}` };
    }
  } catch {
    /* fall through */
  }
  return { ask: 500_000, note: "fallback $0.50 (Gemini unreachable)" };
}

async function main() {
  const provider = getProvider();
  const program = getProgram(provider);
  const conn = provider.connection;
  const pid = program.programId;
  const as = (kp: Keypair) =>
    new Program<HeldQuote>(idl as HeldQuote, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed", preflightCommitment: "confirmed" }));
  const admin = loadOrCreateKeypair("arbiter.json");
  const faucet = loadOrCreateKeypair("faucet.json");
  const maker = loadOrCreateKeypair("seller-glow.json");

  const top = async (to: PublicKey, sol: number) => {
    if ((await conn.getBalance(to)) >= sol * LAMPORTS_PER_SOL * 0.6) return;
    await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL })));
  };
  await top(admin.publicKey, 0.15);
  await top(maker.publicKey, 0.3);

  const out: Record<string, unknown>[] = [];
  for (const spec of SPECS) {
    await pace();
    const market = marketPda(pid, spec.id);
    const yesMint = yesMintPda(pid, market);
    const noMint = noMintPda(pid, market);
    const pool = poolPda(pid, market, maker.publicKey);
    const close = Math.floor(Date.parse(spec.closeTime) / 1000);

    if (!(await conn.getAccountInfo(market))) {
      if (close <= Date.now() / 1000 + 600) {
        console.log(`skip market ${spec.id}: closes too soon`);
        continue;
      }
      await as(admin)
        .methods.createMarket({ id: new BN(spec.id), question: spec.question, resolutionSource: spec.resolution, reference: spec.reference.symbol.slice(0, 64), closeTime: new BN(close) })
        .accountsPartial({ admin: admin.publicKey, market, collateralMint: USDC_MINT, yesMint, noMint, vault: ata(USDC_MINT, market) })
        .rpc();
      console.log(`market ${spec.id} created: ${spec.question}`);
      await pace();
    }

    if (!(await conn.getAccountInfo(pool))) {
      // Test USDC → fully backed sets → YES inventory into program custody.
      await provider.sendAndConfirm(
        new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, ata(USDC_MINT, maker.publicKey), maker.publicKey, USDC_MINT),
          createMintToInstruction(USDC_MINT, ata(USDC_MINT, maker.publicKey), faucet.publicKey, SETS * 1_000_000)
        ),
        [faucet]
      );
      await pace();
      await as(maker)
        .methods.split(new BN(SETS))
        .accountsPartial({
          owner: maker.publicKey,
          market,
          collateralMint: USDC_MINT,
          yesMint,
          noMint,
          vault: ata(USDC_MINT, market),
          ownerCollateral: ata(USDC_MINT, maker.publicKey),
          ownerYes: ata(yesMint, maker.publicKey),
          ownerNo: ata(noMint, maker.publicKey),
        })
        .rpc();
      await pace();
      const ref = await referenceAsk(spec.reference.symbol);
      await as(maker)
        .methods.openPool({ ask: new BN(ref.ask), holdRate: new BN(HOLD_RATE), maxHoldSecs: MAX_HOLD_SECS })
        .accountsPartial({ maker: maker.publicKey, market, pool, yesMint, collateralMint: USDC_MINT, yesVault: ata(yesMint, pool), proceedsVault: ata(USDC_MINT, pool) })
        .rpc();
      await as(maker)
        .methods.deposit(new BN(SETS))
        .accountsPartial({ maker: maker.publicKey, pool, yesMint, yesVault: ata(yesMint, pool), makerYes: ata(yesMint, maker.publicKey) })
        .rpc();
      await pace();
      console.log(`  pool opened at ${ref.ask / 1e6} (${ref.note}), ${SETS} YES in custody`);
    }

    out.push({
      id: spec.id,
      market: market.toBase58(),
      pool: pool.toBase58(),
      yesMint: yesMint.toBase58(),
      question: spec.question,
      category: spec.category,
      closeTime: spec.closeTime,
      reference: { venue: "Gemini Predictions", ...spec.reference },
    });
  }

  const dest = path.join(__dirname, "..", "..", "frontend", "src", "deployment.json");
  const current = JSON.parse(fs.readFileSync(dest, "utf8"));
  fs.writeFileSync(dest, JSON.stringify({ ...current, markets: out }, null, 2) + "\n");
  console.log(`wrote ${out.length} markets to ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
