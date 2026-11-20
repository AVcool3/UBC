/**
 * Adds inventory to the demo maker's pool: the faucet mints test USDC to the
 * maker, the maker splits it into fully backed YES+NO sets, and deposits the
 * YES side into program custody.
 *
 *   SETS=500 ANCHOR_WALLET=keys/seller-glow.json npm run restock
 */
import { BN } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getProgram, getProvider, loadOrCreateKeypair, marketPda, noMintPda, poolPda, yesMintPda } from "./common";

const SETS = Number(process.env.SETS ?? 500);
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);

(async () => {
  const provider = getProvider(); // signs as the maker
  const program = getProgram(provider);
  const maker = provider.wallet.publicKey;
  const faucet = loadOrCreateKeypair("faucet.json");
  const pid = program.programId;
  const market = marketPda(pid, Number(process.env.MARKET_ID ?? 1));
  const m = await program.account.market.fetch(market);
  const pool = poolPda(pid, market, maker);
  const usdc = m.collateralMint;

  await provider.sendAndConfirm(
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(maker, ata(usdc, maker), maker, usdc),
      createMintToInstruction(usdc, ata(usdc, maker), faucet.publicKey, SETS * 1_000_000)
    ),
    [faucet]
  );
  await program.methods
    .split(new BN(SETS))
    .accountsPartial({
      owner: maker,
      market,
      collateralMint: usdc,
      yesMint: yesMintPda(pid, market),
      noMint: noMintPda(pid, market),
      vault: m.vault,
      ownerCollateral: ata(usdc, maker),
      ownerYes: ata(m.yesMint, maker),
      ownerNo: ata(m.noMint, maker),
    })
    .rpc();
  const yes = Number((await provider.connection.getTokenAccountBalance(ata(m.yesMint, maker))).value.amount);
  await program.methods
    .deposit(new BN(yes))
    .accountsPartial({ maker, pool, yesMint: m.yesMint, yesVault: ata(m.yesMint, pool), makerYes: ata(m.yesMint, maker) })
    .rpc();
  const p = await program.account.pool.fetch(pool);
  console.log(`deposited ${yes} YES → available ${p.available}, reserved ${p.reserved}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
