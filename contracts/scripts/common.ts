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
import idl from "../target/idl/ghost_checkout.json";
import type { GhostCheckout } from "../target/types/ghost_checkout";

export const KEYS_DIR = path.join(__dirname, "..", "keys");

export function getProvider(): anchor.AnchorProvider {
  process.env.ANCHOR_PROVIDER_URL ??= "https://api.devnet.solana.com";
  process.env.ANCHOR_WALLET ??= path.join(os.homedir(), ".config", "solana", "id.json");
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  return provider;
}

export function getProgram(provider: anchor.AnchorProvider): Program<GhostCheckout> {
  return new Program<GhostCheckout>(idl as GhostCheckout, provider);
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

export const configPda = (programId: PublicKey) => pda(programId, [Buffer.from("config")]);
export const sellerPda = (programId: PublicKey, authority: PublicKey) =>
  pda(programId, [Buffer.from("seller"), authority.toBuffer()]);
export const listingPda = (programId: PublicKey, sellerProfile: PublicKey, index: number) =>
  pda(programId, [
    Buffer.from("listing"),
    sellerProfile.toBuffer(),
    new anchor.BN(index).toArrayLike(Buffer, "le", 8),
  ]);
