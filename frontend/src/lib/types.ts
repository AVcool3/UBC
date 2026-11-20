/**
 * Account types generated from the IDL. If you add a field in state.rs,
 * rebuild + `npm run export-idl` (in /contracts) and it shows up here.
 */
import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { HeldQuote } from "@/idl/held_quote";

export type MarketAccount = IdlAccounts<HeldQuote>["market"];
export type PoolAccount = IdlAccounts<HeldQuote>["pool"];
export type HoldAccount = IdlAccounts<HeldQuote>["hold"];
export type WithKey<T> = { publicKey: PublicKey; account: T };

/** Anchor decodes Rust enums as `{ held: {} }`; this turns that into "held". */
export type HoldStatusName = "held" | "exercised" | "released";
export const holdStatus = (h: HoldAccount): HoldStatusName => Object.keys(h.status)[0] as HoldStatusName;

/** Byte offset of `buyer` inside a Hold account: discriminator 8 + pool 32 + market 32 + maker 32. */
export const HOLD_BUYER_OFFSET = 8 + 32 + 32 + 32;
