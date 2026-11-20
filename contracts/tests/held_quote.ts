/**
 * Local-validator integration tests for held_quote.
 *
 * Every guarantee the product claims has a test here:
 *   - atomic buy_now (both legs or neither), price limit, inventory limit
 *   - hold: fee math, price frozen even if the maker reprices, reserved shares
 *     can't be withdrawn or sold to anyone else
 *   - exercise: only the beneficiary, only before expiry, only once
 *   - release: only after expiry, by anyone, shares go back to `available` only
 *   - concurrent buyers racing for the last lot, duplicate submission
 *   - resolution blocks trading/exercise; redeem pays $1 per winning share
 *   - conservation of collateral and shares across ALL accounts, and the pool
 *     invariant (vault == available + reserved) after every step of a
 *     randomized state-machine run checked against a JS model.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import type { HeldQuote } from "../target/types/held_quote";

// "confirmed" everywhere so one client never simulates against state another hasn't seen yet.
const envProvider = anchor.AnchorProvider.env();
const provider = new anchor.AnchorProvider(envProvider.connection, envProvider.wallet, {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
anchor.setProvider(provider);
const program = anchor.workspace.HeldQuote as Program<HeldQuote>;
const conn = provider.connection;
const admin = (provider.wallet as anchor.Wallet).payer;

const USD = 1_000_000; // collateral base units per $1
const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
const le = (n: number | BN) => new BN(n).toArrayLike(Buffer, "le", 8);
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bal(account: PublicKey): Promise<number> {
  try {
    return Number((await getAccount(conn, account)).amount);
  } catch {
    return 0;
  }
}

async function chainNow(): Promise<number> {
  const slot = await conn.getSlot("confirmed");
  return (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}

/** Waits until the cluster clock reaches `ts` (unix seconds). */
async function waitUntil(ts: number) {
  for (;;) {
    if ((await chainNow()) >= ts) return;
    await sleep(400);
  }
}

/** Everything an error says: Anchor code, message, program logs (SendTransactionError keeps them in logs). */
function errText(e: unknown): string {
  const err = e as {
    error?: { errorCode?: { code?: string } };
    message?: string;
    logs?: string[];
    transactionLogs?: string[];
    transactionMessage?: string;
  };
  return [err.error?.errorCode?.code, err.message, err.transactionMessage, ...(err.logs ?? []), ...(err.transactionLogs ?? [])]
    .filter(Boolean)
    .join(" ");
}

/** Expects `p` to fail with Anchor error `name` (or a message fragment). */
async function expectError(p: Promise<unknown>, name: string) {
  try {
    await p;
  } catch (e) {
    expect(errText(e), `expected ${name}`).to.include(name);
    return;
  }
  throw new Error(`expected failure ${name}, but it succeeded`);
}

async function fund(...kps: Keypair[]) {
  const tx = new Transaction();
  for (const k of kps) tx.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k.publicKey, lamports: 2 * LAMPORTS_PER_SOL }));
  await provider.sendAndConfirm(tx);
}

/** Program client signing as `kp`. */
const as = (kp: Keypair) =>
  new Program<HeldQuote>(program.idl, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed", preflightCommitment: "confirmed" }));

describe("held_quote", () => {
  const maker = Keypair.generate();
  const buyerA = Keypair.generate();
  const buyerB = Keypair.generate();
  const stranger = Keypair.generate();
  let usdc: PublicKey;
  // Unique per run so the suite can rerun against the same validator.
  let marketId = Math.floor(Date.now() / 1000) % 1_000_000;
  let market: PublicKey, yesMint: PublicKey, noMint: PublicKey, vault: PublicKey;
  let pool: PublicKey, yesVault: PublicKey, proceeds: PublicKey;
  const everyone = () => [admin.publicKey, maker.publicKey, buyerA.publicKey, buyerB.publicKey, stranger.publicKey];

  const TERMS = { ask: new BN(600_000), holdRate: new BN(10_000), maxHoldSecs: 30 }; // $0.60, $0.01/share-min

  async function newMarket(closeInSecs: number) {
    const id = marketId++;
    const m = pda([Buffer.from("market"), le(id)]);
    const y = pda([Buffer.from("yes"), m.toBuffer()]);
    const n = pda([Buffer.from("no"), m.toBuffer()]);
    await program.methods
      .createMarket({
        id: new BN(id),
        question: "Will the Fed hike 25bps at the December 2026 meeting?",
        resolutionSource: "Federal Reserve FOMC statement (test admin resolves)",
        reference: "GEMI-FED261211-HIKE25",
        closeTime: new BN((await chainNow()) + closeInSecs),
      })
      .accountsPartial({ admin: admin.publicKey, market: m, collateralMint: usdc, yesMint: y, noMint: n, vault: ata(usdc, m) })
      .rpc();
    return { id, market: m, yesMint: y, noMint: n, vault: ata(usdc, m) };
  }

  async function poolState() {
    return program.account.pool.fetch(pool);
  }

  /** The pool invariant: shares in custody == available + reserved. */
  async function assertPoolInvariant() {
    const p = await poolState();
    expect(await bal(yesVault)).to.equal(p.available.toNumber() + p.reserved.toNumber());
  }

  /** Conservation: all collateral and YES shares are accounted for across every holder. */
  async function totals() {
    let collateral = 0;
    let yes = 0;
    for (const o of everyone()) {
      collateral += await bal(ata(usdc, o));
      yes += await bal(ata(yesMint, o));
    }
    collateral += (await bal(vault)) + (await bal(proceeds));
    yes += await bal(yesVault);
    return { collateral, yes };
  }

  async function hold(buyer: Keypair, nonce: number, qty: number, secs: number, maxPrice = 999_999, maxFee = 1_000_000_000) {
    const h = pda([Buffer.from("hold"), pool.toBuffer(), buyer.publicKey.toBuffer(), le(nonce)]);
    await as(buyer)
      .methods.hold(new BN(nonce), new BN(qty), secs, new BN(maxPrice), new BN(maxFee))
      .accountsPartial({
        buyer: buyer.publicKey,
        market,
        pool,
        hold: h,
        collateralMint: usdc,
        proceedsVault: proceeds,
        buyerCollateral: ata(usdc, buyer.publicKey),
      })
      .rpc();
    return h;
  }

  const buyNow = (buyer: Keypair, qty: number, maxPrice: number) =>
    as(buyer)
      .methods.buyNow(new BN(qty), new BN(maxPrice))
      .accountsPartial({
        buyer: buyer.publicKey,
        market,
        pool,
        yesMint,
        collateralMint: usdc,
        yesVault,
        proceedsVault: proceeds,
        buyerCollateral: ata(usdc, buyer.publicKey),
        buyerYes: ata(yesMint, buyer.publicKey),
      })
      .rpc();

  const exercise = (buyer: Keypair, h: PublicKey) =>
    as(buyer)
      .methods.exercise()
      .accountsPartial({
        buyer: buyer.publicKey,
        market,
        pool,
        hold: h,
        yesMint,
        collateralMint: usdc,
        yesVault,
        proceedsVault: proceeds,
        buyerCollateral: ata(usdc, buyer.publicKey),
        buyerYes: ata(yesMint, buyer.publicKey),
      })
      .rpc();

  const release = (caller: Keypair, h: PublicKey) =>
    as(caller).methods.release().accountsPartial({ caller: caller.publicKey, pool, hold: h }).rpc();

  const setTerms = (ask: number, rate = 10_000, maxHold = 30) =>
    as(maker).methods.setTerms({ ask: new BN(ask), holdRate: new BN(rate), maxHoldSecs: maxHold }).accountsPartial({ maker: maker.publicKey, pool }).rpc();

  const moveInventory = (method: "deposit" | "withdraw", n: number) =>
    as(maker)
      .methods[method](new BN(n))
      .accountsPartial({ maker: maker.publicKey, pool, yesMint, yesVault, makerYes: ata(yesMint, maker.publicKey) })
      .rpc();

  before(async () => {
    await fund(maker, buyerA, buyerB, stranger);
    usdc = await createMint(conn, admin, admin.publicKey, null, 6);
    for (const o of everyone()) {
      await createAssociatedTokenAccount(conn, admin, usdc, o);
      await mintTo(conn, admin, usdc, ata(usdc, o), admin, 100 * USD);
    }
    ({ market, yesMint, noMint, vault } = await newMarket(3600));
    pool = pda([Buffer.from("pool"), market.toBuffer(), maker.publicKey.toBuffer()]);
    yesVault = ata(yesMint, pool);
    proceeds = ata(usdc, pool);
  });

  // ---------------------------------------------------------------------------
  describe("market", () => {
    it("rejects a close time in the past", async () => {
      const m = pda([Buffer.from("market"), le(marketId + 500_000)]);
      await expectError(
        program.methods
          .createMarket({ id: new BN(marketId + 500_000), question: "q", resolutionSource: "s", reference: "r", closeTime: new BN(1) })
          .accountsPartial({
            admin: admin.publicKey,
            market: m,
            collateralMint: usdc,
            yesMint: pda([Buffer.from("yes"), m.toBuffer()]),
            noMint: pda([Buffer.from("no"), m.toBuffer()]),
            vault: ata(usdc, m),
          })
          .rpc(),
        "CloseTimeInPast"
      );
    });

    it("split: $1 of collateral → 1 YES + 1 NO, fully backed", async () => {
      await as(maker)
        .methods.split(new BN(60))
        .accountsPartial({
          owner: maker.publicKey,
          market,
          collateralMint: usdc,
          yesMint,
          noMint,
          vault,
          ownerCollateral: ata(usdc, maker.publicKey),
          ownerYes: ata(yesMint, maker.publicKey),
          ownerNo: ata(noMint, maker.publicKey),
        })
        .rpc();
      expect(await bal(ata(yesMint, maker.publicKey))).to.equal(60);
      expect(await bal(ata(noMint, maker.publicKey))).to.equal(60);
      expect(await bal(vault)).to.equal(60 * USD);
      expect((await program.account.market.fetch(market)).setsOutstanding.toNumber()).to.equal(60);
    });
  });

  // ---------------------------------------------------------------------------
  describe("maker pool", () => {
    it("rejects off-grid or out-of-range prices", async () => {
      for (const ask of [0, 605_000, USD]) {
        await expectError(
          as(maker)
            .methods.openPool({ ask: new BN(ask), holdRate: new BN(0), maxHoldSecs: 30 })
            .accountsPartial({ maker: maker.publicKey, market, pool, yesMint, collateralMint: usdc, yesVault, proceedsVault: proceeds })
            .rpc(),
          "InvalidPrice"
        );
      }
    });

    it("opens a pool and moves inventory into program custody", async () => {
      await as(maker)
        .methods.openPool(TERMS)
        .accountsPartial({ maker: maker.publicKey, market, pool, yesMint, collateralMint: usdc, yesVault, proceedsVault: proceeds })
        .rpc();
      await moveInventory("deposit", 40);
      const p = await poolState();
      expect(p.available.toNumber()).to.equal(40);
      expect((await getAccount(conn, yesVault)).owner.toBase58()).to.equal(pool.toBase58()); // vault owned by the PDA
      await assertPoolInvariant();
    });
  });

  // ---------------------------------------------------------------------------
  describe("buy_now", () => {
    it("is atomic: buyer pays ask × qty, receives qty shares", async () => {
      const before = await totals();
      const usdcBefore = await bal(ata(usdc, buyerA.publicKey));
      await buyNow(buyerA, 5, 600_000);
      expect(await bal(ata(usdc, buyerA.publicKey))).to.equal(usdcBefore - 5 * 600_000);
      expect(await bal(ata(yesMint, buyerA.publicKey))).to.equal(5);
      expect(await bal(proceeds)).to.equal(5 * 600_000); // paid to the pool-owned proceeds vault
      expect(await totals()).to.deep.equal(before); // nothing created or destroyed
      await assertPoolInvariant();
    });

    it("fails with nothing moved when the price is above the buyer's max", async () => {
      await setTerms(640_000);
      const usdcBefore = await bal(ata(usdc, buyerA.publicKey));
      await expectError(buyNow(buyerA, 5, 600_000), "PriceAboveLimit");
      expect(await bal(ata(usdc, buyerA.publicKey))).to.equal(usdcBefore);
      await setTerms(600_000);
    });

    it("fails when there isn't enough inventory", async () => {
      await expectError(buyNow(buyerA, 1_000, 999_999), "InsufficientInventory");
    });

    it("blocks the maker from buying their own inventory", async () => {
      await expectError(buyNow(maker, 1, 999_999), "SelfTrade");
    });
  });

  // ---------------------------------------------------------------------------
  describe("hold → exercise", () => {
    let h: PublicKey;

    it("charges ceil(rate × qty × secs / 60) and reserves the shares", async () => {
      const proceedsBefore = await bal(proceeds);
      h = await hold(buyerA, 1, 20, 30);
      const rec = await program.account.hold.fetch(h);
      expect(rec.feePaid.toNumber()).to.equal(100_000); // $0.01 × 20 × 30/60 = $0.10
      expect(rec.price.toNumber()).to.equal(600_000);
      expect(rec.expiresAt.toNumber() - rec.createdAt.toNumber()).to.equal(30);
      expect(Object.keys(rec.status)[0]).to.equal("held");
      expect(await bal(proceeds)).to.equal(proceedsBefore + 100_000);
      const p = await poolState();
      expect(p.reserved.toNumber()).to.equal(20);
      await assertPoolInvariant();
    });

    it("the maker can't withdraw reserved shares", async () => {
      const p = await poolState();
      await expectError(moveInventory("withdraw", p.available.toNumber() + 1), "WithdrawExceedsAvailable");
    });

    it("someone else can't exercise it", async () => {
      // The hold PDA is derived from the buyer, so a stranger's signature can't satisfy the seeds/has_one check.
      await expectError(exercise(stranger, h), "ConstraintSeeds");
    });

    it("can't be released before expiry", async () => {
      await expectError(release(stranger, h), "HoldNotExpired");
    });

    it("keeps the held price even after the maker reprices", async () => {
      await setTerms(700_000);
      const usdcBefore = await bal(ata(usdc, buyerA.publicKey));
      const yesBefore = await bal(ata(yesMint, buyerA.publicKey));
      const before = await totals();
      await exercise(buyerA, h);
      expect(await bal(ata(usdc, buyerA.publicKey))).to.equal(usdcBefore - 20 * 600_000); // held $0.60, not $0.70
      expect(await bal(ata(yesMint, buyerA.publicKey))).to.equal(yesBefore + 20);
      expect(await totals()).to.deep.equal(before);
      const rec = await program.account.hold.fetch(h);
      expect(Object.keys(rec.status)[0]).to.equal("exercised");
      expect((await poolState()).reserved.toNumber()).to.equal(0);
      await assertPoolInvariant();
      await setTerms(600_000);
    });

    it("can't be exercised twice (no double fulfillment)", async () => {
      await expectError(exercise(buyerA, h), "HoldNotActive");
    });

    it("an exercised hold can't be released (no double credit to inventory)", async () => {
      await expectError(release(stranger, h), "HoldNotActive");
    });

    it("a duplicate submission with the same nonce is rejected", async () => {
      await hold(buyerB, 7, 1, 30);
      await expectError(hold(buyerB, 7, 1, 30), "already in use");
    });

    it("rejects holds longer than the maker's max, above max fee or above max price", async () => {
      await expectError(hold(buyerB, 8, 1, 31), "InvalidHoldLength");
      await expectError(hold(buyerB, 9, 10, 30, 999_999, 49_999), "FeeAboveLimit"); // fee would be $0.05
      await expectError(hold(buyerB, 10, 1, 30, 590_000), "PriceAboveLimit");
    });
  });

  // ---------------------------------------------------------------------------
  describe("expiry and release", () => {
    it("after expiry: exercise fails, anyone can release, shares return to available only", async () => {
      const h = await hold(buyerB, 20, 3, 2);
      const rec = await program.account.hold.fetch(h);
      const pBefore = await poolState();
      const strangerYes = await bal(ata(yesMint, stranger.publicKey));
      await waitUntil(rec.expiresAt.toNumber());
      await expectError(exercise(buyerB, h), "HoldExpired");
      await release(stranger, h);
      const pAfter = await poolState();
      expect(pAfter.available.toNumber()).to.equal(pBefore.available.toNumber() + 3);
      expect(pAfter.reserved.toNumber()).to.equal(pBefore.reserved.toNumber() - 3);
      expect(await bal(ata(yesMint, stranger.publicKey))).to.equal(strangerYes); // the caller gets nothing
      expect(Object.keys((await program.account.hold.fetch(h)).status)[0]).to.equal("released");
      await expectError(release(stranger, h), "HoldNotActive");
      await assertPoolInvariant();
    });
  });

  // ---------------------------------------------------------------------------
  describe("concurrency", () => {
    it("two buyers racing for the last lot: exactly one wins", async () => {
      // Shrink available inventory to exactly 1 share.
      const p = await poolState();
      const extra = p.available.toNumber() - 1;
      if (extra > 0) await moveInventory("withdraw", extra);
      const aUsdc = await bal(ata(usdc, buyerA.publicKey));
      const aYes = await bal(ata(yesMint, buyerA.publicKey));
      const raceHold = pda([Buffer.from("hold"), pool.toBuffer(), buyerB.publicKey.toBuffer(), le(30)]);
      // Both pass simulation against the same state; the chain serializes them.
      const [buy, held] = await Promise.allSettled([buyNow(buyerA, 1, 999_999), hold(buyerB, 30, 1, 30)]);
      try {
        expect([buy, held].filter((r) => r.status === "fulfilled").length).to.equal(1);
        expect((await poolState()).available.toNumber()).to.equal(0);
        await assertPoolInvariant();
        // The loser's assets are untouched (judged from chain state, not error text).
        if (buy.status === "rejected") {
          expect(await bal(ata(usdc, buyerA.publicKey))).to.equal(aUsdc);
          expect(await bal(ata(yesMint, buyerA.publicKey))).to.equal(aYes);
        } else {
          expect(await conn.getAccountInfo(raceHold, "confirmed")).to.equal(null);
        }
        const loser = (buy.status === "rejected" ? buy : held) as PromiseRejectedResult;
        console.log(`      loser: ${buy.status === "rejected" ? "buy_now" : "hold"} → ${errText(loser.reason).slice(0, 80)}`);
      } finally {
        await moveInventory("deposit", 10); // restock for later tests even if an assertion failed
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe("randomized state machine vs model", () => {
    it("40 random operations keep every invariant", async () => {
      // Deterministic PRNG so failures are reproducible.
      let seed = 42;
      const rand = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        return seed % n;
      };
      const buyers = [buyerA, buyerB];
      const active: { h: PublicKey; buyer: Keypair; qty: number; exp: number }[] = [];
      let nonce = 1000;
      const start = await totals();
      for (let step = 0; step < 40; step++) {
        const p = await poolState();
        const model = { available: p.available.toNumber(), reserved: p.reserved.toNumber() };
        const op = rand(6);
        const buyer = buyers[rand(2)];
        const qty = 1 + rand(3);
        try {
          if (op === 0) {
            await buyNow(buyer, qty, 999_999);
            model.available -= qty;
          } else if (op === 1) {
            const h = await hold(buyer, nonce++, qty, 2 + rand(3));
            const rec = await program.account.hold.fetch(h);
            active.push({ h, buyer, qty, exp: rec.expiresAt.toNumber() });
            model.available -= qty;
            model.reserved += qty;
          } else if (op === 2 && active.length) {
            const a = active.shift()!;
            const now = await chainNow();
            if (now < a.exp - 1) {
              await exercise(a.buyer, a.h);
              model.reserved -= a.qty;
            } else {
              await waitUntil(a.exp);
              await release(stranger, a.h);
              model.reserved -= a.qty;
              model.available += a.qty;
            }
          } else if (op === 3) {
            await moveInventory("deposit", qty);
            model.available += qty;
          } else if (op === 4 && model.available >= qty) {
            await moveInventory("withdraw", qty);
            model.available -= qty;
          } else {
            await setTerms((50 + rand(20)) * 10_000);
          }
        } catch (e) {
          // Only expected business-rule failures are allowed; the model is then unchanged.
          const text = errText(e);
          expect(["InsufficientInventory", "HoldExpired", "WithdrawExceedsAvailable"].some((c) => text.includes(c)), text).to.equal(true);
          continue;
        }
        const after = await poolState();
        expect({ available: after.available.toNumber(), reserved: after.reserved.toNumber() }).to.deep.equal(model);
        await assertPoolInvariant();
        expect(await totals()).to.deep.equal(start); // conservation across all participants
      }
      // Clean up: every remaining hold is eventually releasable.
      for (const a of active) {
        await waitUntil(a.exp);
        await release(stranger, a.h).catch(() => undefined);
      }
      const end = await poolState();
      expect(end.reserved.toNumber()).to.equal(
        (await program.account.hold.all()).filter((h) => h.account.pool.equals(pool) && "held" in h.account.status).reduce((s, h) => s + h.account.qty.toNumber(), 0)
      );
      await assertPoolInvariant();
    });
  });

  // ---------------------------------------------------------------------------
  describe("proceeds and resolution", () => {
    it("only the maker can claim proceeds", async () => {
      const claim = (who: Keypair, amount: number) =>
        as(who)
          .methods.claimProceeds(new BN(amount))
          .accountsPartial({ maker: who.publicKey, pool, collateralMint: usdc, proceedsVault: proceeds, makerCollateral: ata(usdc, who.publicKey) })
          .rpc();
      await expectError(claim(stranger, 1), "ConstraintSeeds");
      const amount = await bal(proceeds);
      const before = await bal(ata(usdc, maker.publicKey));
      await claim(maker, amount);
      expect(await bal(ata(usdc, maker.publicKey))).to.equal(before + amount);
    });

    it("after resolution: no trading, no exercise; release still works; winners redeem $1", async () => {
      // The randomized run may have sold out the pool; mint 5 fresh sets and restock.
      await as(maker)
        .methods.split(new BN(5))
        .accountsPartial({
          owner: maker.publicKey,
          market,
          collateralMint: usdc,
          yesMint,
          noMint,
          vault,
          ownerCollateral: ata(usdc, maker.publicKey),
          ownerYes: ata(yesMint, maker.publicKey),
          ownerNo: ata(noMint, maker.publicKey),
        })
        .rpc();
      await moveInventory("deposit", 5);
      const h = await hold(buyerA, 5000, 1, 2);
      const rec = await program.account.hold.fetch(h);
      await program.methods.resolve(1).accountsPartial({ admin: admin.publicKey, market }).rpc();
      await expectError(buyNow(buyerA, 1, 999_999), "MarketResolved");
      await expectError(exercise(buyerA, h), "MarketResolved");
      await waitUntil(rec.expiresAt.toNumber());
      await release(stranger, h);
      await assertPoolInvariant();

      const shares = await bal(ata(yesMint, buyerA.publicKey));
      const usdcBefore = await bal(ata(usdc, buyerA.publicKey));
      const redeem = (mint: PublicKey) =>
        as(buyerA)
          .methods.redeem(new BN(shares))
          .accountsPartial({
            owner: buyerA.publicKey,
            market,
            collateralMint: usdc,
            winningMint: mint,
            vault,
            ownerWinning: ata(mint, buyerA.publicKey),
            ownerCollateral: ata(usdc, buyerA.publicKey),
          })
          .rpc();
      // NO lost: the maker holds NO shares, but the program refuses to pay for them.
      await expectError(
        as(maker)
          .methods.redeem(new BN(1))
          .accountsPartial({
            owner: maker.publicKey,
            market,
            collateralMint: usdc,
            winningMint: noMint,
            vault,
            ownerWinning: ata(noMint, maker.publicKey),
            ownerCollateral: ata(usdc, maker.publicKey),
          })
          .rpc(),
        "MarketNotResolved"
      );
      await redeem(yesMint);
      expect(await bal(ata(usdc, buyerA.publicKey))).to.equal(usdcBefore + shares * USD);
      expect(await bal(ata(yesMint, buyerA.publicKey))).to.equal(0);
    });

    it("a hold can't outlast the market's close", async () => {
      const short = await newMarket(5);
      const p2 = pda([Buffer.from("pool"), short.market.toBuffer(), maker.publicKey.toBuffer()]);
      await as(maker)
        .methods.openPool(TERMS)
        .accountsPartial({
          maker: maker.publicKey,
          market: short.market,
          pool: p2,
          yesMint: short.yesMint,
          collateralMint: usdc,
          yesVault: ata(short.yesMint, p2),
          proceedsVault: ata(usdc, p2),
        })
        .rpc();
      const h = pda([Buffer.from("hold"), p2.toBuffer(), buyerB.publicKey.toBuffer(), le(1)]);
      await expectError(
        as(buyerB)
          .methods.hold(new BN(1), new BN(1), 30, new BN(999_999), new BN(1_000_000))
          .accountsPartial({
            buyer: buyerB.publicKey,
            market: short.market,
            pool: p2,
            hold: h,
            collateralMint: usdc,
            proceedsVault: ata(usdc, p2),
            buyerCollateral: ata(usdc, buyerB.publicKey),
          })
          .rpc(),
        "HoldPastClose"
      );
    });
  });
});
