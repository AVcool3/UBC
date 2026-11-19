/** Small display helpers. */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { USDC_DECIMALS } from "./contracts";

/** USDC base units (BN or number) → "$12.50". */
export function usd(amount: BN | number | bigint): string {
  const n = typeof amount === "number" ? amount : Number(amount.toString());
  return `$${(n / 10 ** USDC_DECIMALS).toFixed(2)}`;
}

/** "$12.50" / "12.5" → base units. Returns null if invalid. */
export function parseUsd(input: string): BN | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const units = new BN(whole).mul(new BN(10 ** USDC_DECIMALS)).add(new BN(frac.padEnd(USDC_DECIMALS, "0")));
  return units.isZero() ? null : units;
}

export const short = (key: PublicKey | string, n = 4) => {
  const s = typeof key === "string" ? key : key.toBase58();
  return `${s.slice(0, n)}…${s.slice(-n)}`;
};

/** Human, anonymous order code shown to sellers instead of a name. */
export const orderCode = (order: PublicKey) => `#${order.toBase58().slice(0, 6).toUpperCase()}`;

/** "in 4m 12s" / "3m ago" relative to now (both in unix seconds). */
export function relative(targetSecs: number, nowSecs: number): string {
  const diff = targetSecs - nowSecs;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = Math.floor(abs % 60);
  const txt = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
  return diff >= 0 ? `in ${txt}` : `${txt} ago`;
}
