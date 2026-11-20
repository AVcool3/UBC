/**
 * Sets up the demo on a cluster (default devnet). Safe to re-run.
 *
 *   1. A binary market mirroring a Gemini Predictions contract (question + reference symbol).
 *      Resolution here is by our TEST admin, so the terms are NOT identical to Gemini's.
 *   2. A maker pool: the maker turns test USDC into fully backed YES+NO sets and puts
 *      YES inventory into program custody, quoting an ask near the Gemini reference.
 *   3. Real example receipts (buy now, hold → exercise, hold → expire → release) so a
 *      judge without a wallet can verify the central claim on the receipt page.
 *   4. Writes ../frontend/src/deployment.json: pinned public identifiers + example
 *      signatures + capture time. No secrets.
 *
 * Roles (keys/ is git-ignored; the same keys are already in the hosted app's env):
 *   keys/arbiter.json      market admin (creates + resolves)     ← DEMO_ARBITER_KEY
 *   keys/faucet.json       test-USDC mint authority              ← DEMO_FAUCET_KEY
 *   keys/seller-glow.json  the maker                             ← DEMO_SELLER_KEYS[0]
 *   ANCHOR_WALLET          pays SOL for set-up
 *
 *   ANCHOR_WALLET=<funded keypair> npm run seed-market
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import idl from "../target/idl/held_quote.json";
import type { HeldQuote } from "../target/types/held_quote";
import { getProgram, getProvider, holdPda, loadOrCreateKeypair, marketPda, noMintPda, poolPda, yesMintPda } from "./common";

const MARKET_ID = Number(process.env.MARKET_ID ?? 1);
const REFERENCE_SYMBOL = "GEMI-FED261211-HIKE25";
const QUESTION = "Will the Fed raise rates by 25 bps at its December 9, 2026 meeting?";
const RESOLUTION =
  "FOMC statement on Dec 9, 2026. Devnet test market: resolved by our test admin, not by Gemini.";
const CLOSE_TIME = Date.parse("2026-12-09T18:00:00Z") / 1000;
const USDC_MINT = new PublicKey(process.env.USDC_MINT ?? "Crsx17TuZzj6Mna53EsSnLQRPfwXuSYnu3Z8kJvi3vfm");
const SETS = 400; // complete sets the maker mints ($400 test USDC)
const INVENTORY = 300; // YES shares the maker puts in custody
const HOLD_RATE = 1_250; // $0.00125 per share-minute ≈ econ normal-regime break-even ($0.001242)
const MAX_HOLD_SECS = 60;
const USD = 1_000_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);

/** Public, read-only Gemini book → best ask rounded UP to a cent (or a fallback). */
async function referenceAsk(): Promise<{ ask: number; note: string }> {
  try {
    const res = await fetch(`https://api.gemini.com/v1/book/${REFERENCE_SYMBOL}?limit_bids=1&limit_asks=1`);
    const book = (await res.json()) as { asks?: { price: string }[] };
    const best = Number(book.asks?.[0]?.price);
    if (best > 0 && best < 1) return { ask: Math.ceil(best * 100) * 10_000, note: `Gemini best ask ${best} at ${new Date().toISOString()}` };
  } catch {
    /* fall through */
  }
  return { ask: 930_000, note: "fallback $0.93 (Gemini unreachable)" };
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
  const buyer = loadOrCreateKeypair("example-buyer.json");

  const market = marketPda(pid, MARKET_ID);
  const yesMint = yesMintPda(pid, market);
  const noMint = noMintPda(pid, market);
  const pool = poolPda(pid, market, maker.publicKey);

  // ---- SOL + test USDC for the roles ----
  const topUp = async (to: PublicKey, sol: number) => {
    if ((await conn.getBalance(to)) >= sol * LAMPORTS_PER_SOL * 0.6) return;
    await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL })));
  };
  await topUp(admin.publicKey, 0.1);
  await topUp(maker.publicKey, 0.2);
  await topUp(buyer.publicKey, 0.05);
  const mintUsdc = async (to: PublicKey, dollars: number) => {
    let have = 0;
    try {
      have = Number((await getAccount(conn, ata(USDC_MINT, to))).amount);
    } catch {
      /* no account yet */
    }
    if (have >= dollars * USD * 0.9) return;
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, ata(USDC_MINT, to), to, USDC_MINT),
        createMintToInstruction(USDC_MINT, ata(USDC_MINT, to), faucet.publicKey, dollars * USD - have)
      ),
      [faucet]
    );
  };
  await mintUsdc(maker.publicKey, SETS + 20);
  await mintUsdc(buyer.publicKey, 40);

  // ---- Market ----
  if (!(await conn.getAccountInfo(market))) {
    await as(admin)
      .methods.createMarket({ id: new BN(MARKET_ID), question: QUESTION, resolutionSource: RESOLUTION, reference: REFERENCE_SYMBOL, closeTime: new BN(CLOSE_TIME) })
      .accountsPartial({ admin: admin.publicKey, market, collateralMint: USDC_MINT, yesMint, noMint, vault: ata(USDC_MINT, market) })
      .rpc();
    console.log("market created", market.toBase58());
  }

  // ---- Maker inventory ----
  let makerYes = 0;
  try {
    makerYes = Number((await getAccount(conn, ata(yesMint, maker.publicKey))).amount);
  } catch {
    /* none yet */
  }
  const poolExists = !!(await conn.getAccountInfo(pool));
  if (!poolExists && makerYes < INVENTORY) {
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
    console.log(`maker split ${SETS} sets`);
  }
  const ref = await referenceAsk();
  if (!poolExists) {
    await as(maker)
      .methods.openPool({ ask: new BN(ref.ask), holdRate: new BN(HOLD_RATE), maxHoldSecs: MAX_HOLD_SECS })
      .accountsPartial({ maker: maker.publicKey, market, pool, yesMint, collateralMint: USDC_MINT, yesVault: ata(yesMint, pool), proceedsVault: ata(USDC_MINT, pool) })
      .rpc();
    await as(maker)
      .methods.deposit(new BN(INVENTORY))
      .accountsPartial({ maker: maker.publicKey, pool, yesMint, yesVault: ata(yesMint, pool), makerYes: ata(yesMint, maker.publicKey) })
      .rpc();
    console.log(`pool opened at ask ${ref.ask} (${ref.note}), ${INVENTORY} YES in custody`);
  }

  // ---- Example receipts (real transactions) ----
  const p = await program.account.pool.fetch(pool);
  const buyerAccounts = {
    buyer: buyer.publicKey,
    market,
    pool,
    yesMint,
    collateralMint: USDC_MINT,
    yesVault: ata(yesMint, pool),
    proceedsVault: ata(USDC_MINT, pool),
    buyerCollateral: ata(USDC_MINT, buyer.publicKey),
    buyerYes: ata(yesMint, buyer.publicKey),
  };
  const buySig = await as(buyer).methods.buyNow(new BN(5), p.ask).accountsPartial(buyerAccounts).rpc();
  console.log("buy_now", buySig);

  const holdIx = async (nonce: number, qty: number, secs: number) => {
    const hold = holdPda(pid, pool, buyer.publicKey, nonce);
    const sig = await as(buyer)
      .methods.hold(new BN(nonce), new BN(qty), secs, p.ask, new BN(USD))
      .accountsPartial({ buyer: buyer.publicKey, market, pool, hold, collateralMint: USDC_MINT, proceedsVault: ata(USDC_MINT, pool), buyerCollateral: ata(USDC_MINT, buyer.publicKey) })
      .rpc();
    return { hold, sig };
  };
  const nonceBase = Date.now();
  const held = await holdIx(nonceBase, 10, 60);
  console.log("hold", held.sig);
  const exerciseSig = await as(buyer).methods.exercise().accountsPartial({ ...buyerAccounts, hold: held.hold }).rpc();
  console.log("exercise", exerciseSig);

  const expiring = await holdIx(nonceBase + 1, 2, 5);
  const rec = await program.account.hold.fetch(expiring.hold);
  const chainNow = async () => (await conn.getBlockTime(await conn.getSlot("confirmed"))) ?? 0;
  while ((await chainNow()) < rec.expiresAt.toNumber()) await sleep(1000);
  const releaseSig = await program.methods.release().accountsPartial({ caller: provider.wallet.publicKey, pool, hold: expiring.hold }).rpc();
  console.log("release", releaseSig);

  // ---- Pinned identifiers for the frontend (public values only) ----
  const cluster = conn.rpcEndpoint.includes("devnet") ? "devnet" : conn.rpcEndpoint.includes("127.0.0.1") ? "localnet" : "mainnet-beta";
  const out = {
    cluster,
    programId: pid.toBase58(),
    marketId: MARKET_ID,
    market: market.toBase58(),
    maker: maker.publicKey.toBase58(),
    pool: pool.toBase58(),
    collateralMint: USDC_MINT.toBase58(),
    yesMint: yesMint.toBase58(),
    reference: { venue: "Gemini Predictions", symbol: REFERENCE_SYMBOL, termsMatch: false, termsNote: "Same question. Different resolver (our devnet test admin) and settlement, so prices are shown side by side but never compared numerically." },
    examples: {
      capturedAt: new Date().toISOString(),
      mode: `${cluster} (real transactions, test assets)`,
      buyNow: buySig,
      holdCreated: held.sig,
      holdExercised: exerciseSig,
      exercisedHold: held.hold.toBase58(),
      holdReleased: releaseSig,
      releasedHold: expiring.hold.toBase58(),
    },
  };
  const dest = path.join(__dirname, "..", "..", "frontend", "src", "deployment.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
