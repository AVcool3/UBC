/**
 * /evidence — what we measured and what it means, including where the
 * baseline (plain atomic buy) beats our hold. Static page; numbers come from
 * econ/RESULTS.md (seeded synthetic paths + one labelled Gemini snapshot).
 *
 * Laid out as a long-read article:
 *   kicker pair → headline → standfirst → byline block → body with drop cap
 *   → numbered sections, each with a small kicker and serif heading.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { KickerPair } from "@/components/ui";

const REPO = "https://github.com/AVcool3/UBC/blob/claude/firm-quote";

const ROWS: [string, string, string, string, string][] = [
  ["Buy-now misses its limit", "3.2%", "13.9%", "28.5%", "24.4%"],
  ["Hold advantage for the buyer, $/order (fee incl.)", "−0.021", "−0.004", "+0.070", "−0.005"],
  ["Maker net per hold, $", "+0.009", "−0.010", "−0.084", "−0.018"],
  ["Unfilled shares per order: buy-now / hold", "0 / 0", "0 / 0", "0 / 0", "1.62 / 0.39"],
];

export default function EvidencePage() {
  return (
    <article className="mx-auto max-w-3xl">
      {/* ---------- Article header ---------- */}
      <header className="reveal">
        <p className="kicker flex flex-wrap items-center gap-4">
          <KickerPair left="Evidence · 4 min read" right="Nov 20, 2026" />
        </p>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-balance sm:text-[3.4rem]">
          A hold is an option. It&apos;s worth paying for only when the book is thin or moving.
        </h1>
        <p className="mt-6 font-serif text-xl leading-relaxed text-muted">
          What we tested overnight, where a plain buy beats our own product, and the one thing the chain actually adds.
        </p>
      </header>

      {/* ---------- Byline block (hairline rules above and below) ---------- */}
      <div className="reveal reveal-2 mt-12 flex items-center gap-5 border-y border-line py-7">
        {/* Initials disc: terracotta → forest gradient, like an author avatar. */}
        <span
          aria-hidden
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-forest font-sans text-xl font-semibold text-bg shadow-[0_10px_24px_-10px_rgb(70_45_20/0.6)]"
        >
          H
        </span>
        <div>
          <p className="font-sans text-base font-semibold">The Held team</p>
          <p className="mt-1 font-serif text-[15px] text-muted">Replay harness, a real order-book snapshot and two independent reviews.</p>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <a className="link" href={`${REPO}/econ/RESULTS.md`}>
              Results
            </a>
            <a className="link" href={`${REPO}/docs/research/economist.md`}>
              Claims ledger
            </a>
            <a className="link" href={`${REPO}/docs/research/review.md`}>
              Skeptic review
            </a>
          </p>
        </div>
      </div>

      {/* ---------- Lede ---------- */}
      <div className="prose-serif reveal reveal-3 mt-12 sm:px-8">
        <p className="dropcap">
          We started out wanting to sell everyone a &quot;firm quote&quot;. Our own replay says that&apos;s wrong. On identical price
          paths, a plain atomic buy with a max price (plus honest pending/final labels) beats a priced hold in calm, normal and thin
          markets. A hold priced fairly just moves money between buyer and maker; it doesn&apos;t create any.
        </p>
        <p>
          What survives is <b>fill certainty</b>: in thin books the hold cut unfilled shares from 1.62 to 0.39 per order. So the app
          defaults to <b>Buy now</b>, and offers the hold as an explicitly priced option.
        </p>
      </div>

      {/* ---------- 01 Replay results ---------- */}
      <Section n="01" kicker="Replay" title="Replay results">
        <p className="font-serif text-muted">60 s hold, $0.00124 per share-minute; n = 4,000 per regime.</p>
        <div className="mt-5 overflow-x-auto border-y border-ink/80">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 pr-3"></th>
                {["Calm", "Normal", "Volatile", "Thin"].map((h) => (
                  <th key={h} className="kicker py-3 pr-3 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]} className="border-t border-line first:border-t-0">
                  {r.map((c, i) => (
                    <td key={i} className={`py-3 pr-3 tabular-nums ${i === 0 ? "font-serif text-[15px] text-muted" : "text-right font-medium"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Seeded SYNTHETIC paths (logit random walk with jumps), not venue data; no lookahead; bootstrap 95% CIs in{" "}
          <a className="link" href={`${REPO}/econ/RESULTS.md`}>
            econ/RESULTS.md
          </a>
          . Probability points, $/share and $/order are kept separate there.
        </p>
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/econ/hold-vs-baseline.svg"
            alt="Chart: buyer advantage of the hold versus buy-now by hold length and market regime. Negative in calm, normal and thin markets; positive only in volatile markets."
            className="w-full rounded-lg border border-line bg-white p-2"
          />
          <figcaption className="mt-2 font-serif text-sm italic text-muted">
            Buyer advantage of the hold over buy-now, by hold length and regime. Only the volatile regime is positive.
          </figcaption>
        </figure>
      </Section>

      {/* ---------- 02 Worked example (pull-quote styling) ---------- */}
      <Section n="02" kicker="Worked example" title="Hand-checked: 20 shares held at $0.60">
        <ul className="prose-serif space-y-3">
          <li className="border-l-2 border-forest pl-4">
            Later the ask is $0.64: the hold saves <b>$0.80</b> before its fee. A binding buy at $0.60 would have been just as good.
          </li>
          <li className="border-l-2 border-accent pl-4">
            Later the ask is $0.56: the hold is worth <b>$0</b> (you walk away and buy cheaper; the fee is lost). A binding buy at $0.60 is{" "}
            <b>$0.80 worse</b> than waiting.
          </li>
        </ul>
        <blockquote className="mt-8 border-y border-line py-6 text-center font-display text-2xl font-medium italic leading-snug text-ink sm:text-[1.7rem]">
          That asymmetry is the option the buyer pays for, and why the maker has to charge for it.
        </blockquote>
      </Section>

      {/* ---------- 03 Real observation ---------- */}
      <Section n="03" kicker="Observed" title="One real observation (snapshot, not a time series)">
        <p className="prose-serif">
          Gemini Predictions, <span className="font-mono text-[15px]">GEMI-FED261211-HIKE25</span>, retrieved 2026-11-20 09:13 UTC: best
          ask $0.93 for only 25 contracts, then $0.94 for 6,666. A 40-contract buy limited at the displayed $0.93 fails with{" "}
          <i>no price move at all</i>; filling it costs $0.15 more. Thin books are where a held, reserved quantity matters.
        </p>
      </Section>

      {/* ---------- 04 Prior art ---------- */}
      <Section n="04" kicker="Prior art" title="Who already does something like this">
        <ul className="prose-serif list-disc space-y-3 pl-5 marker:text-accent">
          <li>
            <b>RFQ on Kalshi; Polymarket and Gemini on combos; Jupiter Z on Solana:</b> quotes good for about 5–55 seconds, but the
            maker can still back out (&quot;last look&quot;) and nothing is reserved on-chain.
          </li>
          <li>
            <b>Hopper Price Freeze</b> (travel) is the consumer version of a priced hold, backed by a company&apos;s promise.
          </li>
          <li>
            <b>What&apos;s different here:</b> the reserved shares sit in program custody, so the hold can&apos;t be pulled, and anyone
            can verify it from chain state. That is the one guarantee the chain adds. It&apos;s an engineering choice, not a new
            financial idea.
          </li>
        </ul>
      </Section>

      {/* ---------- 05 Status ledger ---------- */}
      <Section n="05" kicker="Status" title="Implemented · observed · simulated · not done">
        <dl className="divide-y divide-line border-y border-line">
          <Ledger term="Implemented">
            Anchor program (buy now, hold, exercise, release, fully backed YES/NO sets, resolve/redeem) on devnet, 23 integration tests
            + 5 unit tests, this app, a wallet-free receipt verifier.
          </Ledger>
          <Ledger term="Observed">
            Real devnet transactions (see the{" "}
            <Link className="link" href="/">
              trade page
            </Link>
            &apos;s example receipts); Gemini&apos;s public book (read-only).
          </Ledger>
          <Ledger term="Simulated">All economics (seeded synthetic paths); the maker reprice button in demo mode.</Ledger>
          <Ledger term="Not done">
            Any real venue integration. Our shares are devnet test instruments resolved by a test admin, so they&apos;re not comparable
            to Gemini&apos;s contract.
          </Ledger>
        </dl>
        <p className="mt-4 text-xs text-muted">
          Full research:{" "}
          <a className="link" href={`${REPO}/docs/research/economist.md`}>
            claims ledger
          </a>{" "}
          ·{" "}
          <a className="link" href={`${REPO}/docs/research/market-structure.md`}>
            venue map
          </a>{" "}
          ·{" "}
          <a className="link" href={`${REPO}/docs/research/protocol.md`}>
            protocol review
          </a>{" "}
          ·{" "}
          <a className="link" href={`${REPO}/docs/research/review.md`}>
            skeptic review
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

/** A numbered article section: "01 — KICKER" then a serif heading, then content. */
function Section({ n, kicker, title, children }: { n: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-20">
      <p className="kicker flex items-center gap-3">
        <span className="font-display text-lg tracking-normal text-accent">{n}</span>
        <span aria-hidden className="kicker-rule w-6" />
        {kicker}
      </p>
      <h2 className="mt-3 mb-6 font-display text-3xl font-semibold leading-tight tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** One row of the status ledger: small-caps term on the left, serif detail on the right. */
function Ledger({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="kicker pt-1 text-ink">{term}</dt>
      <dd className="font-serif text-[16px] leading-relaxed">{children}</dd>
    </div>
  );
}
