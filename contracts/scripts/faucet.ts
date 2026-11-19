/**
 * Local-only test USDC faucet.
 *
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 npx tsx scripts/faucet.ts <WALLET_ADDRESS> [amount=100]
 *
 * Mints test USDC (and airdrops 2 SOL for fees) to a wallet, so you can try the
 * whole flow locally. On devnet use https://faucet.circle.com instead.
 */
import * as anchor from "@coral-xyz/anchor";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { configPda, getProgram, getProvider, isLocal } from "./common";

async function main() {
  const [walletArg, amountArg = "100"] = process.argv.slice(2);
  if (!walletArg) throw new Error("Usage: npx tsx scripts/faucet.ts <WALLET_ADDRESS> [amount]");

  const provider = getProvider();
  if (!isLocal(provider.connection.rpcEndpoint)) {
    throw new Error("The faucet only works on a local validator. On devnet use https://faucet.circle.com");
  }
  const program = getProgram(provider);
  const admin = (provider.wallet as anchor.Wallet).payer;
  const wallet = new PublicKey(walletArg);
  const { usdcMint } = await program.account.config.fetch(configPda(program.programId));

  const sig = await provider.connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
  await provider.connection.confirmTransaction(sig, "confirmed");

  const ata = await getOrCreateAssociatedTokenAccount(provider.connection, admin, usdcMint, wallet);
  await mintTo(provider.connection, admin, usdcMint, ata.address, admin, Math.round(Number(amountArg) * 1_000_000));
  console.log(`Sent ${amountArg} test USDC + 2 SOL to ${wallet.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
