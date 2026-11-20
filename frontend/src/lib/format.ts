/**
 * Units and display helpers. Keep three units distinct:
 *   - collateral base units (integers, 1_000_000 = $1.00)
 *   - dollars per share (what the UI shows: "$0.62")
 *   - shares (whole numbers)
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { COLLATERAL_DECIMALS } from "./contracts";

const toNum = (v: BN | number | bigint) => (typeof v === "number" ? v : Number(v.toString()));

/** Base units → "$12.40". Exact: our amounts stay far below 2^53. */
export function usd(amount: BN | number | bigint, decimals = 2): string {
  return `$${(toNum(amount) / 10 ** COLLATERAL_DECIMALS).toFixed(decimals)}`;
}

/** Fee math — identical to state.rs `hold_fee`: ceil(rate × qty × secs / 60), rounded up. */
export function holdFee(holdRate: number, qty: number, holdSecs: number): number {
  return Math.ceil((holdRate * qty * holdSecs) / 60);
}

/** Fees can be fractions of a cent; show 4 decimals when needed so they never look free. */
export const usdFee = (base: number) => (base > 0 && base % 10_000 !== 0 ? `$${(base / 1e6).toFixed(4)}` : usd(base));

export const short = (key: PublicKey | string, n = 4) => {
  const s = typeof key === "string" ? key : key.toBase58();
  return `${s.slice(0, n)}…${s.slice(-n)}`;
};

/** "0:24" from seconds. */
export const clock = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "4s ago" / "3m ago". */
export function ago(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 172_800) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export const asNumber = toNum;
