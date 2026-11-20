"use client";
/**
 * /receipt/<signature> — works WITHOUT a wallet.
 *
 * Rebuilds a receipt from the chain and runs every check in lib/receipt.ts,
 * showing each one pass/fail with its evidence. A judge can paste any
 * signature from this program, or open one of the seeded examples.
 */
import { useConnection } from "@solana/wallet-adapter-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EXAMPLES, explorerAddress, explorerTx } from "@/lib/contracts";
import { KickerPair } from "@/components/ui";
import { short, usd } from "@/lib/format";
import { useHeldProgram } from "@/lib/program";
import { loadReceipt, type Receipt } from "@/lib/receipt";

const TITLES: Record<Receipt["kind"], string> = {
  buy_now: "Bought now",
  hold_created: "Price held (not bought yet)",
  hold_exercised: "Held price → bought",
  hold_released: "Hold expired → shares returned to the pool",
  other: "Transaction",
};

const isExample = (sig: string) => Object.values(EXAMPLES).includes(sig);

export default function ReceiptPage() {
  const { sig } = useParams<{ sig: string }>();
  const { connection } = useConnection();
  const { program } = useHeldProgram();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    // Signatures are base58, 64–88 chars. Reject anything else before touching the RPC.
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(sig)) {
      setError("That isn't a Solana transaction signature.");
      setLoading(false);
      return;
    }
    loadReceipt(connection, program, sig)
      .then((r) => alive && setReceipt(r))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sig, connection, program]);

  const f = receipt?.fields ?? {};
  const passed = receipt?.checks.filter((c) => c.ok).length ?? 0;
  const total = receipt?.checks.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {isExample(sig) && (
        <p className="reveal rounded-lg border border-dashed border-line p-4 font-serif text-sm italic text-muted">
          Example receipt · a real {EXAMPLES.mode} captured {new Date(EXAMPLES.capturedAt).toUTCString()} when this demo was seeded. Everything below is
          re-read from the chain right now.
        </p>
      )}
      {/* Header: kicker, serif title, then the signature like a filing number. */}
      <header className="reveal reveal-1">
        <p className="kicker flex flex-wrap items-center gap-4">
          <KickerPair left="Receipt" right="Verified against chain state" />
        </p>
        <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{receipt ? TITLES[receipt.kind] : "Receipt"}</h1>
        <p className="mt-4 break-all border-l-2 border-accent pl-3 font-mono text-xs text-muted">{sig}</p>
      </header>

      {loading && <p className="font-serif italic text-muted" role="status">Reading the transaction from Solana…</p>}
      {error && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 p-4 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      {receipt && (
        <>
          {/* ---- What happened ---- */}
          <section className="reveal reveal-2 rounded-xl border border-line bg-surface p-6 shadow-[0_30px_60px_-34px_rgb(70_45_20/0.35)] sm:p-8">
            <p className="kicker mb-5">What happened</p>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              {f.qty !== undefined && <Row k="Shares (YES)" v={String(f.qty)} />}
              {f.price !== undefined && <Row k="Price per share" v={usd(Number(f.price))} />}
              {f.totalPaid !== undefined && <Row k="Total paid" v={usd(Number(f.totalPaid))} />}
              {(f.feePaid ?? f.holdFee) !== undefined && <Row k="Hold fee (paid when the hold was made)" v={`$${(Number(f.feePaid ?? f.holdFee) / 1e6).toFixed(4)}`} />}
              {f.holdStatus !== undefined && <Row k="Hold status now" v={String(f.holdStatus)} />}
              {f.holdExpiresAt !== undefined && <Row k="Hold expires/expired" v={new Date(Number(f.holdExpiresAt) * 1000).toUTCString()} />}
              {f.buyer !== undefined && <Row k="Buyer" v={short(String(f.buyer), 6)} href={explorerAddress(String(f.buyer))} />}
              {f.maker !== undefined && <Row k="Maker (test liquidity)" v={short(String(f.maker), 6)} href={explorerAddress(String(f.maker))} />}
              {f.releasedBy !== undefined && <Row k="Released by (anyone may)" v={short(String(f.releasedBy), 6)} />}
              <Row k="Slot" v={String(receipt.slot)} />
              <Row k="Block time" v={receipt.blockTime ? new Date(receipt.blockTime * 1000).toUTCString() : "unknown"} />
              <Row k="Commitment" v={receipt.commitment} />
              <Row k="Cluster" v={receipt.cluster} />
            </dl>
            <p className="mt-6 border-t border-line pt-4 font-serif text-sm leading-relaxed text-muted">
              Shares changing hands today is not the same as the market resolving. YES shares pay $1 each only after the market resolves YES (by our
              devnet test admin), via the program&apos;s redeem instruction.
            </p>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <a className="link" href={explorerTx(sig)} target="_blank" rel="noreferrer">
                Open in Solana Explorer (devnet) ↗
              </a>
              {receipt.hold && (
                <a className="link" href={explorerAddress(receipt.hold)} target="_blank" rel="noreferrer">
                  Hold account ↗
                </a>
              )}
            </p>
          </section>

          {/* ---- Independent checks ---- */}
          <section className="reveal reveal-3" aria-labelledby="checks">
            <p className="kicker">Independent checks</p>
            <h2 id="checks" className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Checked against the chain: {passed} of {total} pass
            </h2>
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {receipt.checks.map((c) => (
                <li key={c.title} className="flex gap-4 py-3.5 text-sm motion-safe:animate-[fadein_0.4s_ease-out]">
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${c.ok ? "bg-good text-bg" : c.ok === false ? "bg-bad text-bg" : "bg-warn text-bg"}`}
                  >
                    {c.ok ? "✓" : c.ok === false ? "✗" : "?"}
                  </span>
                  <span>
                    <span className="font-medium">
                      <span className="sr-only">{c.ok ? "Pass: " : "Fail: "}</span>
                      {c.title}
                    </span>
                    <span className="mt-0.5 block font-serif text-[15px] text-muted">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Trust assumptions: devnet (test network, test USDC); the program&apos;s upgrade authority is our deploy key; the test admin resolves the
              market; the reference price on the trade page is display-only and is not used here.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div>
      <dt className="kicker">{k}</dt>
      <dd className="mt-1 font-medium">
        {href ? (
          <a className="link font-mono" href={href} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
