"use client";
/**
 * Home = the transaction. Above the fold: the question, the executable price
 * and size, the choice (buy now / hold), and one primary action.
 * Left column: the market's terms and the display-only reference price.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketPicker } from "@/components/MarketPicker";
import { ReferencePanel } from "@/components/ReferencePanel";
import { Ticket } from "@/components/Ticket";
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

  return (
    <>
      <MarketPicker markets={MARKETS} selected={entry.id} onSelect={select} />
      {/* Question first on every screen size. */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Binary market · YES pays $1 if it happens
        </p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {m?.question ?? entry.question}
        </h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        {/* ---- Market (columns 1–7 on desktop) ---- */}
        <div className="space-y-4 lg:col-span-7">
          {m && (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
              <div>
                <dt className="inline">Trading closes: </dt>
                <dd className="inline text-ink">
                  {new Date(m.closeTime.toNumber() * 1000)
                    .toUTCString()
                    .replace(":00 GMT", " UTC")}
                </dd>
              </div>
              <div>
                <dt className="inline">Resolution: </dt>
                <dd className="inline text-ink">{m.resolutionSource}</dd>
              </div>
              <div>
                <dt className="inline">Shares: </dt>
                <dd className="inline text-ink">
                  {m.setsOutstanding.toString()} YES/NO sets, each backed by $1
                  test USDC in program custody
                </dd>
              </div>
              <div>
                <dt className="inline">Market account: </dt>
                <dd className="inline">
                  <a
                    className="font-mono text-accent underline"
                    href={explorerAddress(entry.market.toBase58())}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(entry.market)}
                  </a>
                </dd>
              </div>
            </dl>
          )}
          <ReferencePanel marketId={entry.id} />

          <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="font-semibold">
              What the chain guarantees when you hold
            </h2>
            <p className="mt-1 text-muted">
              Your held shares sit in an account only the program can move.
              Until the hold expires they can go to exactly one place: to you,
              at the held price, in the same transaction as your payment. The
              maker can&apos;t sell them to someone else, reprice them or
              withdraw them, and there&apos;s no &quot;last look&quot;. After
              expiry anyone can return them to the pool; nobody else can take
              them.
            </p>
            <p className="mt-2 text-muted">
              Is it worth the fee? Usually not in a calm market: our replay says
              buying now is cheaper there. Holding pays off when the book is
              thin or moving fast.{" "}
              <Link className="text-accent underline" href="/evidence">
                See the evidence
              </Link>
              .
            </p>
            <p className="mt-2 text-xs text-muted">
              No wallet? Check a real devnet receipt first:{" "}
              <Link
                className="text-accent underline"
                href={`/receipt/${EXAMPLES.holdExercised}`}
              >
                held price → bought
              </Link>{" "}
              ·{" "}
              <Link
                className="text-accent underline"
                href={`/receipt/${EXAMPLES.buyNow}`}
              >
                bought now
              </Link>{" "}
              ·{" "}
              <Link
                className="text-accent underline"
                href={`/receipt/${EXAMPLES.holdReleased}`}
              >
                hold expired → released
              </Link>
              . Program{" "}
              <a
                className="font-mono underline"
                href={explorerAddress(PROGRAM_ID.toBase58())}
                target="_blank"
                rel="noreferrer"
              >
                {short(PROGRAM_ID)}
              </a>
              .
            </p>
          </section>
        </div>

        {/* ---- Order ticket (columns 8–12 on desktop; first on mobile) ---- */}
        <div className="order-first lg:order-none lg:col-span-5">
          <div className="lg:sticky lg:top-20">
            {/* key: switching markets remounts the ticket so no state carries over */}
            <Ticket key={entry.id} entry={entry} />
          </div>
        </div>
      </div>
    </>
  );
}
