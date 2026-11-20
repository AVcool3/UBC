/**
 * Builds every transaction the buyer can send. Each returns an unsigned
 * Transaction; lib/send.ts simulates, gets it signed and tracks it.
 *
 * Account lists here mirror the #[derive(Accounts)] structs in
 * contracts/programs/held_quote/src/instructions/trade.rs.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { HeldProgram } from "./core";
import { ata, holdPda } from "./pda";
import type { MarketAccount, PoolAccount } from "./types";

export interface Venue {
  market: PublicKey;
  marketData: MarketAccount;
  pool: PublicKey;
  poolData: PoolAccount;
}

function buyerAccounts(v: Venue, buyer: PublicKey) {
  return {
    buyer,
    market: v.market,
    pool: v.pool,
    yesMint: v.marketData.yesMint,
    collateralMint: v.marketData.collateralMint,
    yesVault: v.poolData.yesVault,
    proceedsVault: v.poolData.proceedsVault,
    buyerCollateral: ata(v.marketData.collateralMint, buyer),
    buyerYes: ata(v.marketData.yesMint, buyer),
  };
}

/** Optional cleanup: release the buyer's own expired holds first, so their shares are available again. */
async function releaseIxs(program: HeldProgram, v: Venue, caller: PublicKey, expired: PublicKey[]) {
  return Promise.all(
    expired.slice(0, 3).map((hold) => program.methods.release().accountsPartial({ caller, pool: v.pool, hold }).instruction())
  );
}

/** Buy now: fills at the current ask if it is ≤ maxPrice, otherwise nothing happens. */
export async function buyNowTx(program: HeldProgram, v: Venue, buyer: PublicKey, qty: number, maxPrice: number, expired: PublicKey[] = []) {
  const ix = await program.methods.buyNow(new BN(qty), new BN(maxPrice)).accountsPartial(buyerAccounts(v, buyer)).instruction();
  return new Transaction().add(...(await releaseIxs(program, v, buyer, expired)), ix);
}

/** Hold: pay the fee now, the current ask is frozen for `secs`. Returns the hold address too. */
export async function holdTx(
  program: HeldProgram,
  v: Venue,
  buyer: PublicKey,
  qty: number,
  secs: number,
  maxPrice: number,
  maxFee: number,
  expired: PublicKey[] = []
) {
  // Millisecond timestamp nonce: unique per buyer in practice, and a duplicate
  // simply fails (the hold account already exists) — it can never double-reserve.
  const nonce = new BN(Date.now());
  const hold = holdPda(v.pool, buyer, nonce);
  const ix = await program.methods
    .hold(nonce, new BN(qty), secs, new BN(maxPrice), new BN(maxFee))
    .accountsPartial({
      buyer,
      market: v.market,
      pool: v.pool,
      hold,
      collateralMint: v.marketData.collateralMint,
      proceedsVault: v.poolData.proceedsVault,
      buyerCollateral: ata(v.marketData.collateralMint, buyer),
    })
    .instruction();
  return { tx: new Transaction().add(...(await releaseIxs(program, v, buyer, expired)), ix), hold };
}

/** Exercise: pay the HELD price and receive the shares, atomically. */
export async function exerciseTx(program: HeldProgram, v: Venue, buyer: PublicKey, hold: PublicKey) {
  const ix = await program.methods.exercise().accountsPartial({ ...buyerAccounts(v, buyer), hold }).instruction();
  return new Transaction().add(ix);
}

/** Release: anyone can return an expired hold's shares to the pool. */
export async function releaseTx(program: HeldProgram, v: Venue, caller: PublicKey, hold: PublicKey) {
  const ix = await program.methods.release().accountsPartial({ caller, pool: v.pool, hold }).instruction();
  return new Transaction().add(ix);
}
