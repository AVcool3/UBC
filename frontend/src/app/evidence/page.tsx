/**
 * /evidence — what we measured and what it means, including where the
 * baseline (plain atomic buy) beats our hold. Static page; numbers come from
 * econ/RESULTS.md (seeded synthetic paths + one labelled Gemini snapshot).
 */
import Link from "next/link";

const REPO = "https://github.com/AVcool3/UBC/blob/claude/firm-quote";

const ROWS: [string, string, string, string, string][] = [
  ["Buy-now misses its limit", "3.2%", "13.9%", "28.5%", "24.4%"],
  ["Hold advantage for the buyer, $/order (fee incl.)", "−0.021", "−0.004", "+0.070", "−0.005"],
  ["Maker net per hold, $", "+0.009", "−0.010", "−0.084", "−0.018"],
  ["Unfilled shares per order: buy-now / hold", "0 / 0", "0 / 0", "0 / 0", "1.62 / 0.39"],
];

export default function EvidencePage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence · what we tested overnight</p>
        <h1 className="mt-1 text-2xl font-extrabold">A hold is an option. It&apos;s worth paying for only when the book is thin or moving.</h1>
      </header>

      <section className="rounded-2xl border border-warn/40 bg-warn/5 p-4">
        <h2 className="font-semibold">What changed our mind</h2>
        <p className="mt-1">
          We started out wanting to sell everyone a &quot;firm quote&quot;. Our own replay says that&apos;s wrong. On identical price paths, a plain
          atomic buy with a max price (plus honest pending/final labels) beats a priced hold in calm, normal and thin markets. A hold priced fairly
          just moves money between buyer and maker; it doesn&apos;t create any. What survives is <b>fill certainty</b>: in thin books the hold cut
          unfilled shares from 1.62 to 0.39 per order. So the app defaults to <b>Buy now</b>, and offers the hold as an explicitly priced option.
        </p>
      </section>

      <section>
        <h2 className="font-semibold">Replay results (60 s hold, $0.00124 per share-minute; n = 4,000 per regime)</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="p-2"></th>
                <th className="p-2">Calm</th>
                <th className="p-2">Normal</th>
                <th className="p-2">Volatile</th>
                <th className="p-2">Thin</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]} className="border-t border-line">
                  {r.map((c, i) => (
                    <td key={i} className={`p-2 tabular-nums ${i === 0 ? "text-muted" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Seeded SYNTHETIC paths (logit random walk with jumps), not venue data; no lookahead; bootstrap 95% CIs in{" "}
          <a className="underline" href={`${REPO}/econ/RESULTS.md`}>
            econ/RESULTS.md
          </a>
          . Probability points, $/share and $/order are kept separate there.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/econ/hold-vs-baseline.svg"
          alt="Chart: buyer advantage of the hold versus buy-now by hold length and market regime. Negative in calm, normal and thin markets; positive only in volatile markets."
          className="mt-3 w-full rounded-2xl border border-line bg-white"
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Hand-checked example (20 shares held at $0.60)</h2>
        <ul className="mt-1 list-disc pl-5">
          <li>Later the ask is $0.64: the hold saves <b>$0.80</b> before its fee. A binding buy at $0.60 would have been just as good.</li>
          <li>Later the ask is $0.56: the hold is worth <b>$0</b> (you walk away and buy cheaper; the fee is lost). A binding buy at $0.60 is <b>$0.80 worse</b> than waiting.</li>
        </ul>
        <p className="mt-2 text-xs text-muted">That asymmetry is the option the buyer pays for, and why the maker has to charge for it.</p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">One real observation (snapshot, not a time series)</h2>
        <p className="mt-1">
          Gemini Predictions, <span className="font-mono">GEMI-FED261211-HIKE25</span>, retrieved 2026-11-20 09:13 UTC: best ask $0.93 for only 25
          contracts, then $0.94 for 6,666. A 40-contract buy limited at the displayed $0.93 fails with <i>no price move at all</i>; filling it costs
          $0.15 more. Thin books are where a held, reserved quantity matters.
        </p>
      </section>

      <section>
        <h2 className="font-semibold">Who already does something like this</h2>
        <ul className="mt-1 list-disc pl-5">
          <li>
            <b>RFQ on Kalshi; Polymarket and Gemini on combos; Jupiter Z on Solana:</b> quotes good for about 5–55 seconds, but the maker can still back
            out (&quot;last look&quot;) and nothing is reserved on-chain.
          </li>
          <li>
            <b>Hopper Price Freeze</b> (travel) is the consumer version of a priced hold, backed by a company&apos;s promise.
          </li>
          <li>
            <b>What&apos;s different here:</b> the reserved shares sit in program custody, so the hold can&apos;t be pulled, and anyone can verify it
            from chain state. That is the one guarantee the chain adds. It&apos;s an engineering choice, not a new financial idea.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Implemented · observed · simulated · not done</h2>
        <ul className="mt-1 list-disc pl-5">
          <li>
            <b>Implemented:</b> Anchor program (buy now, hold, exercise, release, fully backed YES/NO sets, resolve/redeem) on devnet, 23 integration
            tests + 5 unit tests, this app, a wallet-free receipt verifier.
          </li>
          <li>
            <b>Observed:</b> real devnet transactions (see the{" "}
            <Link className="text-accent underline" href="/">
              trade page
            </Link>
            &apos;s example receipts); Gemini&apos;s public book (read-only).
          </li>
          <li>
            <b>Simulated:</b> all economics (seeded synthetic paths); the maker reprice button in demo mode.
          </li>
          <li>
            <b>Not done:</b> any real venue integration. Our shares are devnet test instruments resolved by a test admin, so they&apos;re not
            comparable to Gemini&apos;s contract.
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          Full research:{" "}
          <a className="underline" href={`${REPO}/docs/research/economist.md`}>
            claims ledger
          </a>{" "}
          ·{" "}
          <a className="underline" href={`${REPO}/docs/research/market-structure.md`}>
            venue map
          </a>{" "}
          ·{" "}
          <a className="underline" href={`${REPO}/docs/research/protocol.md`}>
            protocol review
          </a>{" "}
          ·{" "}
          <a className="underline" href={`${REPO}/docs/research/review.md`}>
            skeptic review
          </a>
          .
        </p>
      </section>
    </article>
  );
}
