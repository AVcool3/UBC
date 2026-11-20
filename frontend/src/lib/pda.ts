/**
 * PDA (program-derived address) helpers. Seeds MUST match
 * contracts/programs/held_quote/src/state.rs — change both together.
 */
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./contracts";

const find = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const u64le = (n: BN | number) => new BN(n).toArrayLike(Buffer, "le", 8);

export const marketPda = (id: BN | number) => find([Buffer.from("market"), u64le(id)]);
export const yesMintPda = (market: PublicKey) => find([Buffer.from("yes"), market.toBuffer()]);
export const noMintPda = (market: PublicKey) => find([Buffer.from("no"), market.toBuffer()]);
export const poolPda = (market: PublicKey, maker: PublicKey) =>
  find([Buffer.from("pool"), market.toBuffer(), maker.toBuffer()]);
export const holdPda = (pool: PublicKey, buyer: PublicKey, nonce: BN | number) =>
  find([Buffer.from("hold"), pool.toBuffer(), buyer.toBuffer(), u64le(nonce)]);

/** Associated token account for any owner (wallet or PDA). */
export const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
