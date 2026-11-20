"use client";
/**
 * Reference price from Gemini Predictions — DISPLAY ONLY.
 *
 * Visually subordinate on purpose (dashed border, muted, smaller): it is not a
 * price anyone can trade at here. Because the contracts' resolution terms
 * differ (Gemini resolves its contract; our devnet test market is resolved by a
 * test admin), we never compute a numeric gap against it.
 */
import { REFERENCE } from "@/lib/contracts";
import { ago } from "@/lib/format";
import { useReference } from "@/lib/hooks";
import { REFERENCE_STALE_SECS } from "@/lib/reference";

export function ReferencePanel() {
  const { data: ref, error, loading } = useReference();
  const nowSec = Date.now() / 1000;
  const age = ref ? nowSec - (ref.sourceTimestamp ?? ref.retrievedAt) : 0;
  const stale = !!ref && (ref.mode !== "live" || age > REFERENCE_STALE_SECS);
  const bestAsk = ref?.asks[0];
  const bestBid = ref?.bids[0];

  return (
    <section aria-label="Reference price, display only" className="rounded-2xl border border-dashed border-line p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Reference · {REFERENCE.venue}</h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">display only · not tradable here</span>
      </div>
      {loading && !ref && <p className="mt-2 text-muted">Loading reference…</p>}
      {error && !ref && <p className="mt-2 text-muted">Reference price unavailable right now. Trading here doesn't depend on it.</p>}
      {ref && (
        <>
          <p className="mt-2 text-muted">
            <span className="font-mono">{ref.symbol}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              Bid <b className="text-ink">{bestBid ? `$${bestBid.price.toFixed(2)}` : "—"}</b>
              <span className="text-muted"> × {bestBid?.amount ?? 0}</span>
            </span>
            <span>
              Ask <b className="text-ink">{bestAsk ? `$${bestAsk.price.toFixed(2)}` : "—"}</b>
              <span className="text-muted"> × {bestAsk?.amount ?? 0}</span>
            </span>
          </div>
          <p className={`mt-1 text-xs ${stale ? "text-warn" : "text-muted"}`}>
            {ref.mode === "recorded"
              ? `Recorded snapshot · ${ref.note}`
              : ref.mode === "stale"
                ? `Stale · ${ago(age)} · ${ref.note}`
                : `Live · updated ${ago(age)} (venue timestamp)`}
            {stale && ref.mode === "live" && " · may be out of date. Your buy uses the Solana price, which is live."}
          </p>
          {bestAsk && bestAsk.amount < 100 && (
            <p className="mt-1 text-xs text-muted">Thin: only {bestAsk.amount} contracts at the best ask. Bigger orders would pay more.</p>
          )}
          <p className="mt-2 text-xs text-muted">{REFERENCE.termsNote}</p>
        </>
      )}
    </section>
  );
}
