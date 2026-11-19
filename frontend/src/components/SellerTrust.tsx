"use client";
/**
 * Seller reputation, computed ONLY from on-chain order outcomes.
 * There's no review text to fake: completed, refunded, cancelled and dispute
 * counts are written by the program itself when money moves.
 */
import Link from "next/link";
import { explorerAddress } from "@/lib/contracts";
import { usd } from "@/lib/format";
import { sellerPda } from "@/lib/pda";
import type { SellerAccount } from "@/lib/types";

export function trustOf(s: SellerAccount) {
  const completed = s.completedOrders.toNumber();
  const bad = s.refundedUnshipped.toNumber() + s.disputesLost.toNumber();
  const total = completed + bad;
  const score = total === 0 ? null : Math.round((completed / total) * 100);
  // Only call a seller "bad" once there are at least 2 bad outcomes, so one
  // unlucky order doesn't brand a new shop. Tweak these thresholds freely.
  const level: "new" | "good" | "mixed" | "bad" =
    score === null ? "new" : score >= 90 ? "good" : score < 60 && bad >= 2 ? "bad" : "mixed";
  return { completed, bad, total, score, level };
}

const LEVEL_STYLE = {
  new: "bg-surface-2 text-muted",
  good: "bg-good/15 text-good",
  mixed: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

/** Compact chip for the feed: "✓ 98% · 214 delivered". */
export function TrustChip({ seller }: { seller: SellerAccount }) {
  const t = trustOf(seller);
  const label =
    t.score === null ? "New seller · no orders yet" : `${t.level === "good" ? "✓" : "⚠"} ${t.score}% · ${t.completed} delivered`;
  return (
    <Link
      href={`/seller/${seller.authority.toBase58()}`}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold hover:brightness-125 ${LEVEL_STYLE[t.level]}`}
    >
      {label}
    </Link>
  );
}

/** Full stats grid for the seller page and seller dashboard. */
export function TrustStats({ seller }: { seller: SellerAccount }) {
  const t = trustOf(seller);
  const items: [string, string, string][] = [
    ["Completed orders", String(t.completed), "text-good"],
    ["Never shipped (auto-refunded)", seller.refundedUnshipped.toString(), seller.refundedUnshipped.toNumber() ? "text-bad" : ""],
    ["Disputes lost", seller.disputesLost.toString(), seller.disputesLost.toNumber() ? "text-bad" : ""],
    ["Disputes won", seller.disputesWon.toString(), ""],
    ["Cancelled by seller", seller.cancelledOrders.toString(), ""],
    ["Total sales", usd(seller.totalVolume), ""],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([label, value, cls]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-3">
            <div className={`text-xl font-bold ${cls}`}>{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      <a
        className="mt-3 inline-block text-xs text-accent underline"
        href={explorerAddress(sellerPda(seller.authority).toBase58())}
        target="_blank"
        rel="noreferrer"
      >
        Verify these numbers on Solana Explorer ↗
      </a>
    </div>
  );
}
