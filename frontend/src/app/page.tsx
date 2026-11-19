"use client";
/**
 * Shop feed — every active listing on-chain, with each seller's verifiable
 * track record next to the Buy button.
 */
import { useState } from "react";
import { CheckoutModal } from "@/components/CheckoutModal";
import { DemoBanner } from "@/components/DemoBanner";
import { ProductArt } from "@/components/ProductArt";
import { TrustChip, trustOf } from "@/components/SellerTrust";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";
import { short, usd } from "@/lib/format";
import { useConfig, useMarket } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";
import type { ListingAccount, WithKey } from "@/lib/types";

const PROMISES = [
  { icon: "🕶️", title: "Seller never learns who you are", text: "No name, card, phone or readable address." },
  { icon: "🔐", title: "Paid only on delivery", text: "USDC waits in escrow until the carrier delivers." },
  { icon: "🧾", title: "Reviews that can't be faked", text: "Ratings come only from real, completed orders." },
];

export default function ShopPage() {
  const { program } = useGhostProgram();
  const config = useConfig(program);
  const market = useMarket(program);
  const [buying, setBuying] = useState<WithKey<ListingAccount> | null>(null);

  const listings = market.data?.listings.filter((l) => l.account.active) ?? [];

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="mb-8 rounded-3xl border border-line bg-gradient-to-br from-accent-strong/25 via-surface to-surface p-6 sm:p-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          Buy from anyone in your feed. <span className="text-accent">Reveal nothing.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Ghost Checkout is a private, escrowed checkout for social commerce, settled in USDC on Solana.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-2xl bg-bg/50 p-4">
              <div className="text-2xl">{p.icon}</div>
              <div className="mt-1 font-semibold">{p.title}</div>
              <div className="text-sm text-muted">{p.text}</div>
            </div>
          ))}
        </div>
      </section>

      <DemoBanner />
      {config.data === null && !config.loading && <SetupNotice />}
      {market.error && <ErrorBlock error={market.error} onRetry={market.refresh} />}
      {market.loading && !market.data && <LoadingBlock />}

      {market.data && listings.length === 0 && (
        <EmptyState title="No listings yet">Open the Sell tab to list the first product.</EmptyState>
      )}

      {/* ---- Feed ---- */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => {
          const seller = market.data?.sellers.get(l.account.sellerAuthority.toBase58())?.account;
          const trust = seller ? trustOf(seller) : null;
          const risky = trust?.level === "bad";
          return (
            <article key={l.publicKey.toBase58()} className="overflow-hidden rounded-3xl border border-line bg-surface">
              <ProductArt title={l.account.title} imageUrl={l.account.imageUrl} className="aspect-[4/5] w-full lg:aspect-square" />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold leading-snug">{l.account.title}</h2>
                  <span className="text-lg font-extrabold">{usd(l.account.price)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{seller?.name ?? short(l.account.sellerAuthority)}</span>
                  {seller && <TrustChip seller={seller} />}
                </div>
                {risky && (
                  <p className="rounded-xl bg-bad/10 p-2 text-xs text-bad">
                    ⚠ This seller failed to ship or lost a dispute on {trust!.bad} of {trust!.total} orders. If you buy,
                    escrow still protects your money.
                  </p>
                )}
                <Button className="w-full py-3" onClick={() => setBuying(l)} disabled={!config.data}>
                  Buy privately
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {buying && config.data && (
        <CheckoutModal
          listing={buying}
          seller={market.data?.sellers.get(buying.account.sellerAuthority.toBase58())?.account}
          config={config.data}
          onClose={() => setBuying(null)}
        />
      )}
    </>
  );
}
