"use client";
/**
 * Gemini Predictions reference data — DISPLAY ONLY.
 *
 * Visually subordinate on purpose (dashed border, muted): none of these prices
 * are tradable here, and Gemini's contract resolves differently from our devnet
 * test market, so we never compute a "you save X" number against it.
 *
 * What it does show, from Gemini's public read-only API:
 *  1. the whole event board (every outcome bucket), with the one our market mirrors highlighted;
 *  2. what buying 10 / 25 / 40 / 100 contracts would cost by walking Gemini's
 *     live book — the thin-book problem a held price is for;
 *  3. recent public trades and the official contract terms.
 */
import { REFERENCE } from "@/lib/contracts";
import { ago } from "@/lib/format";
import { useReference } from "@/lib/hooks";
import { REFERENCE_STALE_SECS, walkAsks } from "@/lib/reference";

const SIZES = [10, 25, 40, 100];
const cents = (p: number | null) => (p === null ? "—" : `$${p.toFixed(2)}`);

export function ReferencePanel() {
  const { data: ref, error, loading } = useReference();
  const nowSec = Date.now() / 1000;
  const age = ref ? nowSec - (ref.sourceTimestamp ?? ref.retrievedAt) : 0;
  const stale = !!ref && (ref.mode !== "live" || age > REFERENCE_STALE_SECS);
  const bestAsk = ref?.asks[0];
  const bestBid = ref?.bids[0];

  return (
    <section aria-label="Gemini Predictions reference data, display only" className="space-y-3 rounded-2xl border border-dashed border-line p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Reference · {REFERENCE.venue}</h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">display only · not tradable here</span>
      </div>
      {loading && !ref && <p className="text-muted">Loading Gemini data…</p>}
      {error && !ref && <p className="text-muted">Gemini data unavailable right now. Trading here doesn&apos;t depend on it.</p>}

      {ref && (
        <>
          {/* ---- 1. The event board ---- */}
          {ref.event && ref.event.outcomes.length > 0 && (
            <div>
              <p className="font-medium">
                {ref.event.title}{" "}
                <span className="text-xs font-normal text-muted">
                  · {ref.event.outcomes.length} outcomes{ref.event.volume !== null ? ` · $${Math.round(ref.event.volume).toLocaleString()} traded` : ""}
                </span>
              </p>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full min-w-[300px] text-xs tabular-nums">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 text-left font-normal">Outcome</th>
                      <th className="py-1 text-right font-normal">Bid</th>
                      <th className="py-1 text-right font-normal">Ask</th>
                      <th className="py-1 text-right font-normal">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ref.event.outcomes.map((o) => {
                      const ours = o.symbol === ref.symbol;
                      return (
                        <tr key={o.symbol} className={`border-t border-line ${ours ? "text-ink" : "text-muted"}`}>
                          <td className="py-1">
                            {o.label}
                            {ours && <span className="ml-1 rounded bg-accent-strong/20 px-1 text-[10px] text-accent">our market mirrors this</span>}
                          </td>
                          <td className="py-1 text-right">{cents(o.bestBid)}</td>
                          <td className="py-1 text-right">{cents(o.bestAsk)}</td>
                          <td className="py-1 text-right">{cents(o.last)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Top of book for the mirrored contract ---- */}
          <div>
            <p className="font-mono text-xs text-muted">{ref.symbol}</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span>
                Bid <b className="text-ink">{bestBid ? cents(bestBid.price) : "—"}</b>
                <span className="text-muted"> × {bestBid?.amount ?? 0}</span>
              </span>
              <span>
                Ask <b className="text-ink">{bestAsk ? cents(bestAsk.price) : "—"}</b>
                <span className="text-muted"> × {bestAsk?.amount ?? 0}</span>
              </span>
            </div>
            <p className={`mt-0.5 text-xs ${stale ? "text-warn" : "text-muted"}`}>
              {ref.mode === "recorded"
                ? `Recorded snapshot · ${ref.note}`
                : ref.mode === "stale"
                  ? `Stale · ${ago(age)} · ${ref.note}`
                  : `Live · book updated ${ago(age)} (Gemini's timestamp)`}
              {stale && ref.mode === "live" && " · may be out of date. Your buy here uses the Solana price, which is live."}
            </p>
          </div>

          {/* ---- 2. What your size would cost on Gemini's visible book ---- */}
          {ref.asks.length > 0 && (
            <div>
              <p className="font-medium">What buying would cost on Gemini&apos;s book right now</p>
              <table className="mt-1 w-full text-xs tabular-nums">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 text-left font-normal">Contracts</th>
                    <th className="py-1 text-right font-normal">Avg price</th>
                    <th className="py-1 text-right font-normal">Fills at the shown ask?</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZES.map((q) => {
                    const w = walkAsks(ref.asks, q);
                    const atTop = w.levels <= 1 && w.unfilled === 0;
                    return (
                      <tr key={q} className="border-t border-line">
                        <td className="py-1">{q}</td>
                        <td className="py-1 text-right">
                          {w.avg === null ? "—" : `$${w.avg.toFixed(4)}`}
                          {w.unfilled > 0 && <span className="text-warn"> ({w.unfilled} unfillable)</span>}
                        </td>
                        <td className={`py-1 text-right ${atTop ? "text-good" : "text-warn"}`}>
                          {atTop ? "yes" : `no · walks ${w.levels} level${w.levels === 1 ? "" : "s"}, up to ${cents(w.worst)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted">
                A buy limited at the displayed ask fails as soon as your size is bigger than the top level, even if the price never moves. That&apos;s the
                gap a held, reserved quantity closes. (Arithmetic on Gemini&apos;s visible book; fees not included.)
              </p>
            </div>
          )}

          {/* ---- 3. Recent trades + terms ---- */}
          {ref.trades.length > 0 && (
            <div>
              <p className="font-medium">Recent Gemini trades</p>
              <ul className="mt-1 space-y-0.5 text-xs tabular-nums text-muted">
                {ref.trades.slice(0, 4).map((t, i) => (
                  <li key={i}>
                    {ago(nowSec - t.at)} · {t.side} {t.amount} at {cents(t.price)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">
            {REFERENCE.termsNote}
            {ref.event?.termsLink && (
              <>
                {" "}
                <a className="text-accent underline" href={ref.event.termsLink} target="_blank" rel="noreferrer">
                  Gemini&apos;s contract terms ↗
                </a>
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
