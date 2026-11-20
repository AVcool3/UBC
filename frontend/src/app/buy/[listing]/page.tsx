"use client";
/**
 * /buy/<listing> — the product link sellers post on social media.
 *
 * Blink-aware wallets never load this page: /actions.json maps it to
 * /api/actions/buy/<listing> and they show the buy card inline in the post.
 * Everyone else lands here and gets the normal private checkout.
 */
import { PublicKey } from "@solana/web3.js";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckoutModal } from "@/components/CheckoutModal";
import { DemoBanner } from "@/components/DemoBanner";
import { ProductArt } from "@/components/ProductArt";
import { TrustChip, trustOf } from "@/components/SellerTrust";
import { ShareBlinkModal } from "@/components/ShareBlink";
import { Button, EmptyState, LoadingBlock } from "@/components/ui";
import { short, usd } from "@/lib/format";
import { useConfig, useMarket } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";

export default function BuyPage() {
  const params = useParams<{ listing: string }>();
  const listingKey = useMemo(() => {
    try {
      return new PublicKey(params.listing);
    } catch {
      return null;
    }
  }, [params.listing]);

  const { program } = useGhostProgram();
  const config = useConfig(program);
  const market = useMarket(program);
  const [checkout, setCheckout] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!listingKey) return <EmptyState title="Invalid product link" />;
  if (market.loading && !market.data) return <LoadingBlock />;

  const listing = market.data?.listings.find((l) => l.publicKey.equals(listingKey));
  if (!listing) return <EmptyState title="Product not found">It may have been listed on a different network.</EmptyState>;

  const seller = market.data?.sellers.get(listing.account.sellerAuthority.toBase58())?.account;
  const trust = seller ? trustOf(seller) : null;

  return (
    <>
      <DemoBanner />
      <article className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-line bg-surface md:grid-cols-2">
        <ProductArt title={listing.account.title} imageUrl={listing.account.imageUrl} className="aspect-square w-full" />
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h1 className="text-2xl font-extrabold">{listing.account.title}</h1>
            <p className="mt-1 text-3xl font-extrabold">{usd(listing.account.price)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>Sold by {seller?.name ?? short(listing.account.sellerAuthority)}</span>
            {seller && <TrustChip seller={seller} />}
          </div>
          {trust?.level === "bad" && (
            <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad">
              ⚠ This seller failed to ship or lost a dispute on {trust.bad} of {trust.total} orders. If you buy, escrow
              still protects your money.
            </p>
          )}
          <ul className="space-y-1 text-sm text-muted">
            <li>🕶️ The seller never learns your name or address.</li>
            <li>🔐 Your USDC waits in escrow until the carrier delivers.</li>
            <li>↩️ Never shipped? You get an automatic refund.</li>
          </ul>
          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            {listing.account.active ? (
              <Button className="flex-1 py-3 text-base" onClick={() => setCheckout(true)} disabled={!config.data}>
                Buy privately
              </Button>
            ) : (
              <Button className="flex-1 py-3" disabled>
                Listing paused
              </Button>
            )}
            <Button variant="secondary" className="py-3" onClick={() => setSharing(true)}>
              Share as Blink
            </Button>
          </div>
        </div>
      </article>

      {checkout && config.data && (
        <CheckoutModal listing={listing} seller={seller} config={config.data} onClose={() => setCheckout(false)} />
      )}
      {sharing && <ShareBlinkModal listing={listing} onClose={() => setSharing(false)} />}
    </>
  );
}
