/**
 * Every on-chain instruction the app sends, in one file.
 * Each function builds the exact account list the program expects and returns
 * the transaction signature. UI code calls these through `withToast(...)`.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { GhostProgram } from "./program";
import type { ConfigAccount, OrderAccount } from "./types";
import { configPda, listingPda, orderPda, sellerPda, usdcAta } from "./pda";

// ---- Sellers ---------------------------------------------------------------

export function registerSeller(program: GhostProgram, authority: PublicKey, name: string) {
  return program.methods
    .registerSeller(name)
    .accountsPartial({ authority, seller: sellerPda(authority) })
    .rpc();
}

export function createListing(
  program: GhostProgram,
  authority: PublicKey,
  nextIndex: BN,
  title: string,
  imageUrl: string,
  price: BN
) {
  const seller = sellerPda(authority);
  return program.methods
    .createListing(title, imageUrl, price)
    .accountsPartial({ authority, seller, listing: listingPda(seller, nextIndex) })
    .rpc();
}

export function setListingActive(program: GhostProgram, authority: PublicKey, listing: PublicKey, active: boolean) {
  return program.methods.setListingActive(active).accountsPartial({ authority, listing }).rpc();
}

// ---- Buying ------------------------------------------------------------------

/** Pays for `listing` into escrow. Returns { sig, order } so the UI can link to the new order. */
export async function placeOrder(
  program: GhostProgram,
  config: ConfigAccount,
  buyer: PublicKey,
  listing: PublicKey,
  encryptedAddress: Uint8Array
) {
  // Nonce = current time in ms; lets one buyer place many orders on one listing.
  const nonce = new BN(Date.now());
  const order = orderPda(listing, buyer, nonce);
  const sig = await program.methods
    .placeOrder(nonce, Buffer.from(encryptedAddress))
    .accountsPartial({
      buyer,
      config: configPda(),
      listing,
      order,
      usdcMint: config.usdcMint,
      buyerToken: usdcAta(config.usdcMint, buyer),
      vault: usdcAta(config.usdcMint, order),
    })
    .rpc();
  return { sig, order };
}

// ---- Seller fulfilment ------------------------------------------------------

export function markShipped(program: GhostProgram, sellerAuthority: PublicKey, order: PublicKey, trackingHash: number[]) {
  return program.methods.markShipped(trackingHash).accountsPartial({ sellerAuthority, order }).rpc();
}

export function cancelOrder(program: GhostProgram, config: ConfigAccount, order: PublicKey, data: OrderAccount) {
  return program.methods
    .cancelOrder()
    .accountsPartial({
      sellerAuthority: data.sellerAuthority,
      config: configPda(),
      seller: sellerPda(data.sellerAuthority),
      order,
      buyer: data.buyer,
      usdcMint: config.usdcMint,
      buyerToken: usdcAta(config.usdcMint, data.buyer),
      vault: usdcAta(config.usdcMint, order),
    })
    .rpc();
}

// ---- Refunds / release (callable by anyone when the rules allow) ------------

export function refundUnshipped(
  program: GhostProgram,
  config: ConfigAccount,
  caller: PublicKey,
  order: PublicKey,
  data: OrderAccount
) {
  return program.methods
    .refundUnshipped()
    .accountsPartial({
      caller,
      config: configPda(),
      seller: sellerPda(data.sellerAuthority),
      order,
      buyer: data.buyer,
      usdcMint: config.usdcMint,
      buyerToken: usdcAta(config.usdcMint, data.buyer),
      vault: usdcAta(config.usdcMint, order),
    })
    .rpc();
}

export function releasePayment(
  program: GhostProgram,
  config: ConfigAccount,
  caller: PublicKey,
  order: PublicKey,
  data: OrderAccount
) {
  return program.methods
    .releasePayment()
    .accountsPartial({
      caller,
      config: configPda(),
      seller: sellerPda(data.sellerAuthority),
      order,
      buyer: data.buyer,
      sellerAuthority: data.sellerAuthority,
      usdcMint: config.usdcMint,
      sellerToken: usdcAta(config.usdcMint, data.sellerAuthority),
      vault: usdcAta(config.usdcMint, order),
    })
    .rpc();
}

export function openDispute(program: GhostProgram, buyer: PublicKey, order: PublicKey) {
  return program.methods.openDispute().accountsPartial({ buyer, order }).rpc();
}

// ---- Operators ----------------------------------------------------------------

export function confirmDelivery(program: GhostProgram, carrier: PublicKey, order: PublicKey) {
  return program.methods.confirmDelivery().accountsPartial({ carrier, config: configPda(), order }).rpc();
}

export function resolveDispute(
  program: GhostProgram,
  config: ConfigAccount,
  admin: PublicKey,
  order: PublicKey,
  data: OrderAccount,
  refundBuyer: boolean
) {
  return program.methods
    .resolveDispute(refundBuyer)
    .accountsPartial({
      admin,
      config: configPda(),
      seller: sellerPda(data.sellerAuthority),
      order,
      buyer: data.buyer,
      sellerAuthority: data.sellerAuthority,
      usdcMint: config.usdcMint,
      buyerToken: usdcAta(config.usdcMint, data.buyer),
      sellerToken: usdcAta(config.usdcMint, data.sellerAuthority),
      vault: usdcAta(config.usdcMint, order),
    })
    .rpc();
}
