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
    <div className="mx-auto max-w-3xl space-y-4">
      {isExample(sig) && (
        <p className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
          Example receipt · a real {EXAMPLES.mode} captured {new Date(EXAMPLES.capturedAt).toUTCString()} when this demo was seeded. Everything below is
          re-read from the chain right now.
        </p>
      )}
      <h1 className="text-2xl font-extrabold">{receipt ? TITLES[receipt.kind] : "Receipt"}</h1>
      <p className="break-all font-mono text-xs text-muted">{sig}</p>

      {loading && <p className="text-muted" role="status">Reading the transaction from Solana…</p>}
      {error && (
        <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      {receipt && (
        <>
          {/* ---- What happened ---- */}
          <section className="rounded-2xl border border-line bg-surface p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
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
            <p className="mt-3 text-xs text-muted">
              Shares changing hands today is not the same as the market resolving. YES shares pay $1 each only after the market resolves YES (by our
              devnet test admin), via the program&apos;s redeem instruction.
            </p>
            <p className="mt-2 flex flex-wrap gap-3 text-sm">
              <a className="text-accent underline" href={explorerTx(sig)} target="_blank" rel="noreferrer">
                Open in Solana Explorer (devnet) ↗
              </a>
              {receipt.hold && (
                <a className="text-accent underline" href={explorerAddress(receipt.hold)} target="_blank" rel="noreferrer">
                  Hold account ↗
                </a>
              )}
            </p>
          </section>

          {/* ---- Independent checks ---- */}
          <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="checks">
            <h2 id="checks" className="font-semibold">
              Checked against the chain: {passed} of {total} pass
            </h2>
            <ul className="mt-3 space-y-2">
              {receipt.checks.map((c) => (
                <li key={c.title} className="flex gap-3 text-sm motion-safe:animate-[fadein_0.4s_ease-out]">
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
                    <span className="block text-muted">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
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
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium">
        {href ? (
          <a className="font-mono underline" href={href} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
