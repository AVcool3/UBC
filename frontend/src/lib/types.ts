/**
 * TypeScript types for on-chain accounts, generated from the IDL.
 * If you add a field in state.rs, rebuild + `npm run export-idl` and it shows up here.
 */
import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { GhostCheckout } from "@/idl/ghost_checkout";

export type ConfigAccount = IdlAccounts<GhostCheckout>["config"];
export type SellerAccount = IdlAccounts<GhostCheckout>["seller"];
export type ListingAccount = IdlAccounts<GhostCheckout>["listing"];
export type OrderAccount = IdlAccounts<GhostCheckout>["order"];

/** An account plus its address — what `program.account.x.all()` returns. */
export type WithKey<T> = { publicKey: PublicKey; account: T };

/** Anchor decodes Rust enums as `{ paid: {} }`; this turns that into "paid". */
export type OrderStatusName = "paid" | "shipped" | "delivered" | "disputed" | "completed" | "refunded" | "cancelled";
export const statusOf = (o: OrderAccount): OrderStatusName => Object.keys(o.status)[0] as OrderStatusName;
