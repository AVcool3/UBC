"use client";
/**
 * "Share as Blink" modal. Gives a seller (or a fan) three ways to put the
 * product into a social feed so people can buy it without leaving the post:
 *   1. Post on X: the product link unfurls into a buy card for Blink-aware wallets.
 *   2. Open the Blink: the same card in Dialect's viewer (dial.to), handy for demos.
 *   3. QR code: scan with a phone to open the Blink.
 */
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { blinkLinks, tweetUrl } from "@/lib/blink";
import { usd } from "@/lib/format";
import type { ListingAccount, WithKey } from "@/lib/types";
import { ProductArt } from "./ProductArt";
import { Button } from "./ui";

// Links styled like <Button> (a <button> inside an <a> isn't valid HTML).
const LINK_BUTTON = "inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition";

export function ShareBlinkModal({ listing, onClose }: { listing: WithKey<ListingAccount>; onClose: () => void }) {
  // window.location is only available in the browser, so build the links after mount.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const links = origin ? blinkLinks(origin, listing.publicKey.toBase58()) : null;
  const price = usd(listing.account.price);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share as Blink"
      >
        <div className="mb-4 flex items-start gap-4">
          <ProductArt title={listing.account.title} imageUrl={listing.account.imageUrl} className="h-16 w-16 shrink-0 rounded-xl [&_span]:text-3xl" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Sell it right in the feed</h2>
            <p className="text-sm text-muted">
              Share <span className="text-ink">{listing.account.title}</span> as a Solana Blink. Buyers pay {price} into escrow
              from the post itself, and the seller still never sees who they are.
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        {links && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={tweetUrl(`${listing.account.title} · ${price}. Buy it privately, right here 👻`, links.productUrl)}
                target="_blank"
                rel="noreferrer"
                className={`${LINK_BUTTON} bg-accent-strong text-white hover:brightness-110`}
              >
                Post on X
              </a>
              <a href={links.dialToUrl} target="_blank" rel="noreferrer" className={`${LINK_BUTTON} border border-line bg-surface-2 hover:border-accent/60`}>
                Open the Blink ↗
              </a>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-4">
              {/* White box so phone cameras can read the code on the dark theme. */}
              <div className="shrink-0 rounded-xl bg-white p-2">
                <QRCodeSVG value={links.dialToUrl} size={112} />
              </div>
              <p className="text-sm text-muted">
                Scan to open the Blink on your phone. Set your wallet to <b className="text-ink">devnet</b> first.
              </p>
            </div>

            <LinkRow label="Product link (unfurls on X)" value={links.productUrl} onCopy={() => copy(links.productUrl, "Product link")} />
            <LinkRow label="Action API" value={links.actionUrl} onCopy={() => copy(links.actionUrl, "Action URL")} />
          </div>
        )}
      </div>
    </div>
  );
}

function LinkRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={onCopy}>
          Copy
        </Button>
      </div>
    </div>
  );
}
