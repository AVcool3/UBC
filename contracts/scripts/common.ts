/**
 * Helpers shared by the deploy/admin scripts.
 *
 * Every script reads the same environment variables Anchor uses:
 *   ANCHOR_PROVIDER_URL  RPC endpoint (default: devnet)
 *   ANCHOR_WALLET        path to the admin keypair (default: ~/.config/solana/id.json)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../target/idl/held_quote.json";
import type { HeldQuote } from "../target/types/held_quote";

export const KEYS_DIR = path.join(__dirname, "..", "keys");

export function getProvider(): anchor.AnchorProvider {
  process.env.ANCHOR_PROVIDER_URL ??= "https://api.devnet.solana.com";
  process.env.ANCHOR_WALLET ??= path.join(os.homedir(), ".config", "solana", "id.json");
  // "confirmed" everywhere: the public devnet RPC is load-balanced, and a
  // "processed" blockhash is often unknown to the node that simulates the tx.
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(env.connection.rpcEndpoint, "confirmed"),
    env.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);
  return provider;
}

export function getProgram(provider: anchor.AnchorProvider): Program<HeldQuote> {
  return new Program<HeldQuote>(idl as HeldQuote, provider);
}

export const isLocal = (url: string) => url.includes("127.0.0.1") || url.includes("localhost");

/** Loads a Solana keypair JSON (array of 64 numbers), creating it if missing. */
export function loadOrCreateKeypair(file: string): Keypair {
  const full = path.join(KEYS_DIR, file);
  if (fs.existsSync(full)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(full, "utf8"))));
  }
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const kp = Keypair.generate();
  fs.writeFileSync(full, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

export function pda(programId: PublicKey, seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

const le = (n: number | anchor.BN) => new anchor.BN(n).toArrayLike(Buffer, "le", 8);
export const marketPda = (programId: PublicKey, id: number) => pda(programId, [Buffer.from("market"), le(id)]);
export const yesMintPda = (programId: PublicKey, market: PublicKey) => pda(programId, [Buffer.from("yes"), market.toBuffer()]);
export const noMintPda = (programId: PublicKey, market: PublicKey) => pda(programId, [Buffer.from("no"), market.toBuffer()]);
export const poolPda = (programId: PublicKey, market: PublicKey, maker: PublicKey) =>
  pda(programId, [Buffer.from("pool"), market.toBuffer(), maker.toBuffer()]);
export const holdPda = (programId: PublicKey, pool: PublicKey, buyer: PublicKey, nonce: number | anchor.BN) =>
  pda(programId, [Buffer.from("hold"), pool.toBuffer(), buyer.toBuffer(), le(nonce)]);
