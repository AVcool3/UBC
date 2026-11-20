/**
 * Seller reputation math, shared by the UI (SellerTrust.tsx) and the server
 * (the Blink endpoint warns buyers about risky sellers before they pay).
 *
 * Inputs are ONLY on-chain counters the program writes when money moves,
 * so there's no review text to fake.
 */
import type { SellerAccount } from "./types";

export type TrustLevel = "new" | "good" | "mixed" | "bad";

export function trustOf(s: SellerAccount) {
  const completed = s.completedOrders.toNumber();
  const bad = s.refundedUnshipped.toNumber() + s.disputesLost.toNumber();
  const total = completed + bad;
  const score = total === 0 ? null : Math.round((completed / total) * 100);
  // Only call a seller "bad" once there are at least 2 bad outcomes, so one
  // unlucky order doesn't brand a new shop. Tweak these thresholds freely.
  const level: TrustLevel = score === null ? "new" : score >= 90 ? "good" : score < 60 && bad >= 2 ? "bad" : "mixed";
  return { completed, bad, total, score, level };
}

/** One-line summary, e.g. "✓ 98% · 214 delivered" or "New seller · no orders yet". */
export function trustLabel(s: SellerAccount): string {
  const t = trustOf(s);
  if (t.score === null) return "New seller · no orders yet";
  return `${t.level === "good" ? "✓" : "⚠"} ${t.score}% · ${t.completed} delivered`;
}
