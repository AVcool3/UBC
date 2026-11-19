/**
 * PDA (program-derived address) helpers. These MUST use the same seeds as
 * contracts/programs/ghost_checkout/src/state.rs — change both together.
 */
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./contracts";

const find = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const u64le = (n: BN | number) => new BN(n).toArrayLike(Buffer, "le", 8);

export const configPda = () => find([Buffer.from("config")]);
export const sellerPda = (authority: PublicKey) => find([Buffer.from("seller"), authority.toBuffer()]);
export const listingPda = (sellerProfile: PublicKey, index: BN | number) =>
  find([Buffer.from("listing"), sellerProfile.toBuffer(), u64le(index)]);
export const orderPda = (listing: PublicKey, buyer: PublicKey, nonce: BN) =>
  find([Buffer.from("order"), listing.toBuffer(), buyer.toBuffer(), u64le(nonce)]);

/** USDC token account for any owner (wallet or PDA). */
export const usdcAta = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
