/**
 * One-time marketplace setup, run right after `anchor deploy`.
 *
 *   npm run init-config                       # devnet, real devnet USDC
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 npm run init-config   # local, creates a test USDC
 *
 * What it does:
 *  1. Creates (or reuses) the carrier's signing key        → keys/carrier.json
 *  2. Creates (or reuses) the carrier's address-decryption key
 *  3. Writes keys/carrier-console.json — load this file in the app's Carrier page
 *  4. Initializes the on-chain Config (admin = your wallet = dispute arbiter)
 *  5. Prints the values to paste into frontend/.env.local
 *
 * Optional env vars:
 *   USDC_MINT               mint to use (default: Circle devnet USDC; on localnet a test mint is created)
 *   SHIP_WINDOW_SECS        default 600   (10 min — short for demos; use 259200 = 3 days in production)
 *   INSPECTION_WINDOW_SECS  default 300   (5 min — use 172800 = 48h in production)
 */
import * as anchor from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import nacl from "tweetnacl";
import { configPda, getProgram, getProvider, isLocal, KEYS_DIR, loadOrCreateKeypair } from "./common";

// Circle's official USDC mint on Solana devnet (get test USDC at https://faucet.circle.com).
const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

async function main() {
  const provider = getProvider();
  const program = getProgram(provider);
  const admin = (provider.wallet as anchor.Wallet).payer;
  const rpc = provider.connection.rpcEndpoint;
  const local = isLocal(rpc);

  console.log(`RPC:      ${rpc}`);
  console.log(`Program:  ${program.programId.toBase58()}`);
  console.log(`Admin:    ${admin.publicKey.toBase58()}`);

  // ---- 1 & 2: carrier keys ------------------------------------------------
  const carrier = loadOrCreateKeypair("carrier.json");
  const encFile = path.join(KEYS_DIR, "carrier-encryption.json");
  let enc: nacl.BoxKeyPair;
  if (fs.existsSync(encFile)) {
    const saved = JSON.parse(fs.readFileSync(encFile, "utf8"));
    enc = nacl.box.keyPair.fromSecretKey(Buffer.from(saved.secretKey, "base64"));
  } else {
    enc = nacl.box.keyPair();
    fs.writeFileSync(
      encFile,
      JSON.stringify({
        publicKey: Buffer.from(enc.publicKey).toString("base64"),
        secretKey: Buffer.from(enc.secretKey).toString("base64"),
      }),
      { mode: 0o600 }
    );
  }

  // ---- 3: one file the Carrier page can load ------------------------------
  const consoleFile = path.join(KEYS_DIR, "carrier-console.json");
  fs.writeFileSync(
    consoleFile,
    JSON.stringify(
      {
        kind: "ghost-checkout-carrier",
        signingSecretKey: Array.from(carrier.secretKey),
        encryptionSecretKey: Buffer.from(enc.secretKey).toString("base64"),
      },
      null,
      2
    ),
    { mode: 0o600 }
  );

  // Give the carrier a little SOL for transaction fees.
  const carrierBal = await provider.connection.getBalance(carrier.publicKey);
  if (carrierBal < 0.02 * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: carrier.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(tx);
    console.log("Funded carrier with 0.05 SOL for fees");
  }

  // ---- 4: config ------------------------------------------------------------
  const config = configPda(program.programId);
  const existing = await program.account.config.fetchNullable(config);
  let usdcMint: PublicKey;

  if (existing) {
    usdcMint = existing.usdcMint;
    console.log("\nConfig already initialized — leaving it as is.");
  } else {
    if (process.env.USDC_MINT) {
      usdcMint = new PublicKey(process.env.USDC_MINT);
    } else if (local) {
      // Local chain has no USDC, so create a 6-decimal test token you control.
      usdcMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);
      fs.writeFileSync(path.join(KEYS_DIR, "local-usdc-mint.txt"), usdcMint.toBase58());
      console.log(`Created local test USDC mint ${usdcMint.toBase58()} (use scripts/faucet.ts to mint)`);
    } else {
      usdcMint = new PublicKey(DEVNET_USDC);
    }

    const ship = new anchor.BN(Number(process.env.SHIP_WINDOW_SECS ?? 600));
    const inspect = new anchor.BN(Number(process.env.INSPECTION_WINDOW_SECS ?? 300));
    const sig = await program.methods
      .initializeConfig(carrier.publicKey, Array.from(enc.publicKey), ship, inspect)
      .accountsPartial({ admin: admin.publicKey, config, usdcMint })
      .rpc();
    console.log(`\nConfig initialized: ${sig}`);
  }

  // ---- 5: frontend values ---------------------------------------------------
  const cluster = local ? "localnet" : rpc.includes("devnet") ? "devnet" : "mainnet-beta";
  console.log("\n=== Paste into frontend/.env.local ===");
  console.log(`NEXT_PUBLIC_SOLANA_RPC_URL=${rpc}`);
  console.log(`NEXT_PUBLIC_SOLANA_CLUSTER=${cluster}`);
  console.log(`NEXT_PUBLIC_PROGRAM_ID=${program.programId.toBase58()}`);
  console.log("\nCarrier signing key:  " + carrier.publicKey.toBase58());
  console.log(`Carrier console file: ${consoleFile}  (load it on the app's /carrier page)`);
  console.log(`Arbiter (disputes):   your admin wallet ${admin.publicKey.toBase58()}`);
  console.log(`USDC mint:            ${usdcMint.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
