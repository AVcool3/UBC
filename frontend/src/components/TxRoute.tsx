"use client";
/**
 * The life of one transaction as a timestamped route of stages
 * (design lesson from Fin.com: a route of stages, not a spinner).
 *
 *   Signed → Submitted → Confirmed → Final
 *
 * "unknown" gets a neutral "?" — never a check or a cross — and keeps the
 * signature visible so the user can look it up instead of trying again.
 * The whole block is an aria-live region, so screen readers hear each change.
 */
import Link from "next/link";
import { explorerTx } from "@/lib/contracts";
import { short } from "@/lib/format";
import type { Stage, TxUpdate } from "@/lib/send";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "signing", label: "Signed" },
  { stage: "submitted", label: "Submitted" },
  { stage: "confirmed", label: "Confirmed" },
  { stage: "finalized", label: "Final" },
];
const ORDER: Stage[] = ["simulating", "signing", "submitted", "confirmed", "finalized"];

/** Plain-language status line for each stage. */
export function statusLine(u: TxUpdate): string {
  switch (u.stage) {
    case "simulating":
      return "Checking the transaction against the program…";
    case "signing":
      return "Waiting for your wallet to sign…";
    case "submitted":
      return "Sent. Waiting for the network to confirm. This usually takes a few seconds.";
    case "confirmed":
      return `Confirmed: ${u.label}. Final in a few seconds.`;
    case "finalized":
      return `Final: ${u.label}. This can't be reversed.`;
    case "rejected":
      return "You cancelled in your wallet. Nothing was sent.";
    case "failed":
      return u.error ?? "The transaction failed. Nothing changed hands.";
    case "unknown":
      return u.error ?? "We don't know yet if this went through. Don't try again yet.";
  }
}

export function TxRoute({ history }: { history: TxUpdate[] }) {
  const last = history[history.length - 1];
  if (!last) return null;
  const reached = (s: Stage) => {
    const at = history.find((h) => h.stage === s);
    if (at) return at;
    // "signing" is implied once submitted.
    if (s === "signing" && history.some((h) => ORDER.indexOf(h.stage) > ORDER.indexOf("signing"))) return history.find((h) => h.stage === "submitted");
    return undefined;
  };
  const sig = [...history].reverse().find((h) => h.signature)?.signature;
  const tone =
    last.stage === "failed" || last.stage === "rejected"
      ? "border-bad/40 bg-bad/10"
      : last.stage === "unknown"
        ? "border-warn/40 bg-warn/10"
        : last.stage === "finalized" || last.stage === "confirmed"
          ? "border-good/40 bg-good/10"
          : "border-line bg-surface-2";

  return (
    <div className={`rounded-2xl border p-3 text-sm ${tone}`}>
      <p role="status" aria-live="polite" className="font-medium">
        {last.stage === "unknown" && <span aria-hidden className="mr-1 inline-block rounded-full bg-warn px-1.5 text-xs font-bold text-bg">?</span>}
        {statusLine(last)}
      </p>
      {last.stage !== "failed" && last.stage !== "rejected" && (
        <ol className="mt-2 grid grid-cols-4 gap-1 text-[11px] text-muted" aria-label="Transaction stages">
          {STEPS.map((s) => {
            const r = reached(s.stage);
            return (
              <li key={s.stage} className={`rounded-lg px-1.5 py-1 ${r ? "bg-bg/60 text-ink" : "opacity-50"}`}>
                <span aria-hidden>{r ? "●" : "○"}</span> {s.label}
                <span className="block font-mono">{r ? new Date(r.at).toLocaleTimeString() : "—"}</span>
              </li>
            );
          })}
        </ol>
      )}
      {sig && (
        <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
          <span>
            Signature <span className="font-mono text-ink">{short(sig, 6)}</span>
          </span>
          <a className="text-accent underline" href={explorerTx(sig)} target="_blank" rel="noreferrer">
            Explorer (devnet) ↗
          </a>
          <Link className="text-accent underline" href={`/receipt/${sig}`}>
            Verify receipt →
          </Link>
        </p>
      )}
    </div>
  );
}
