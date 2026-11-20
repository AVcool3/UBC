"use client";
/**
 * Home = the transaction, laid out like the opening of a feature article:
 *
 *   [ market index ]                       ← MarketPicker
 *   BINARY MARKET —— CLOSES NOV 27          ← kicker pair
 *   The question, as a big serif headline
 *   A one-line serif standfirst
 *   ───────────────────────────────────────
 *   left (7 cols): market terms "byline", reference price, the guarantee essay
 *   right (5 cols): the order ticket (sticky; first on mobile)
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketPicker } from "@/components/MarketPicker";
import { ReferencePanel } from "@/components/ReferencePanel";
import { Ticket } from "@/components/Ticket";
import { KickerPair } from "@/components/ui";
import { EXAMPLES, explorerAddress, MARKETS, PROGRAM_ID } from "@/lib/contracts";
import { short } from "@/lib/format";
import { useVenue } from "@/lib/hooks";
import { useHeldProgram } from "@/lib/program";

export default function TradePage() {
  const { program } = useHeldProgram();
  // Selected market lives in the URL (?m=2) so links and refreshes keep it.
  const [marketId, setMarketId] = useState(MARKETS[0].id);
  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("m"));
    if (MARKETS.some((x) => x.id === fromUrl)) setMarketId(fromUrl);
  }, []);
  const select = (id: number) => {
    setMarketId(id);
    window.history.replaceState(null, "", `?m=${id}`);
  };
  const entry = MARKETS.find((x) => x.id === marketId) ?? MARKETS[0];
  const venue = useVenue(program, entry.market);
  const m = venue.data?.marketData;

  // "NOV 27, 2026" style date for the kicker; falls back to the static config.
  const closeMs = m ? m.closeTime.toNumber() * 1000 : Date.parse(entry.closeTime);
  const closeLabel = new Date(closeMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <MarketPicker markets={MARKETS} selected={entry.id} onSelect={select} />

      {/* ---- Headline block: question first on every screen size ---- */}
      {/* key={entry.id} replays the reveal animation when you switch markets */}
      <header key={entry.id} className="mb-10 max-w-4xl">
        <p className="kicker reveal reveal-1 flex flex-wrap items-center gap-4">
          <KickerPair left={`${entry.category} · binary market`} right={`Closes ${closeLabel}`} />
        </p>
        <h1 className="reveal reveal-2 mt-5 font-display text-4xl font-semibold leading-[1.06] tracking-tight sm:text-balance sm:text-5xl lg:text-[3.5rem]">
          {m?.question ?? entry.question}
        </h1>
        <p className="reveal reveal-3 mt-5 max-w-3xl font-serif text-lg leading-relaxed text-muted sm:text-xl">
          Each YES share pays $1 if it happens. Buy at the price you see now, or pay a small fee to hold that price for a few
          seconds while you decide.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        {/* ---- Market (columns 1–7 on desktop) ---- */}
        <div className="reveal reveal-4 space-y-10 lg:col-span-7">
          {m && (
            // Styled like the article "byline": hairline rules above and below.
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 border-y border-line py-6 text-sm sm:grid-cols-2">
              <Term label="Trading closes">
                {new Date(m.closeTime.toNumber() * 1000).toUTCString().replace(":00 GMT", " UTC")}
              </Term>
              <Term label="Resolution">{m.resolutionSource}</Term>
              <Term label="Shares">
                {m.setsOutstanding.toString()} YES/NO sets, each backed by $1 test USDC in program custody
              </Term>
              <Term label="Market account">
                <a className="link font-mono text-[13px]" href={explorerAddress(entry.market.toBase58())} target="_blank" rel="noreferrer">
                  {short(entry.market)}
                </a>
              </Term>
            </dl>
          )}

          <ReferencePanel marketId={entry.id} />

          {/* ---- The guarantee, written as a short essay with a drop cap ---- */}
          <section>
            <p className="kicker mb-3">The one guarantee</p>
            <h2 className="font-display text-2xl font-semibold leading-tight sm:text-[1.75rem]">What the chain guarantees when you hold</h2>
            <div className="prose-serif mt-5">
              <p className="dropcap">
                Your held shares sit in an account only the program can move. Until the hold expires they can go to exactly one
                place: to you, at the held price, in the same transaction as your payment. The maker can&apos;t sell them to someone
                else, reprice them or withdraw them, and there&apos;s no &quot;last look&quot;. After expiry anyone can return them to
                the pool; nobody else can take them.
              </p>
              <p>
                Is it worth the fee? Usually not in a calm market: our replay says buying now is cheaper there. Holding pays off when
                the book is thin or moving fast.{" "}
                <Link className="link" href="/evidence">
                  See the evidence
                </Link>
                .
              </p>
            </div>

            {/* Example receipts, set like a footnote. */}
            <p className="mt-6 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
              No wallet? Check a real devnet receipt first:{" "}
              <Link className="link" href={`/receipt/${EXAMPLES.holdExercised}`}>
                held price → bought
              </Link>{" "}
              ·{" "}
              <Link className="link" href={`/receipt/${EXAMPLES.buyNow}`}>
                bought now
              </Link>{" "}
              ·{" "}
              <Link className="link" href={`/receipt/${EXAMPLES.holdReleased}`}>
                hold expired → released
              </Link>
              . Program{" "}
              <a className="link font-mono" href={explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">
                {short(PROGRAM_ID)}
              </a>
              .
            </p>
          </section>
        </div>

        {/* ---- Order ticket (columns 8–12 on desktop; first on mobile) ---- */}
        <div className="reveal reveal-3 order-first lg:order-none lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            {/* key: switching markets remounts the ticket so no state carries over */}
            <Ticket key={entry.id} entry={entry} />
          </div>
        </div>
      </div>
    </>
  );
}

/** One "label / value" pair in the market-terms byline. */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="mt-1 font-serif text-[15px] leading-snug text-ink">{children}</dd>
    </div>
  );
}
