"use client";
/** Public seller page: the un-fakeable track record + their live listings. */
import { PublicKey } from "@solana/web3.js";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ProductArt } from "@/components/ProductArt";
import { TrustStats } from "@/components/SellerTrust";
import { Card, EmptyState, LoadingBlock, PageTitle } from "@/components/ui";
import { short, usd } from "@/lib/format";
import { useMarket, useSellerProfile } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";

export default function SellerPage() {
  const params = useParams<{ authority: string }>();
  const authority = useMemo(() => {
    try {
      return new PublicKey(params.authority);
    } catch {
      return null;
    }
  }, [params.authority]);

  const { program } = useGhostProgram();
  const profile = useSellerProfile(program, authority);
  const market = useMarket(program);

  if (!authority) return <EmptyState title="Invalid seller address" />;
  if (profile.loading && !profile.data) return <LoadingBlock />;
  if (!profile.data) return <EmptyState title="This wallet isn't a registered seller" />;

  const s = profile.data;
  const listings = market.data?.listings.filter((l) => l.account.sellerAuthority.equals(authority)) ?? [];
  const joined = new Date(s.joinedAt.toNumber() * 1000).toLocaleDateString();

  return (
    <>
      <PageTitle title={s.name} subtitle={<>Seller {short(authority)} · on Ghost Checkout since {joined}</>} />
      <Card className="mb-6">
        <h2 className="mb-1 font-semibold">Track record</h2>
        <p className="mb-4 text-sm text-muted">
          Written by the escrow program when money moves — the seller can&apos;t edit, buy, or delete any of it.
        </p>
        <TrustStats seller={s} />
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Listings</h2>
      {listings.length === 0 && <EmptyState title="No listings" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <div key={l.publicKey.toBase58()} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <ProductArt title={l.account.title} imageUrl={l.account.imageUrl} className="aspect-square w-full" />
            <div className="flex items-center justify-between p-3">
              <span className="font-medium">{l.account.title}</span>
              <span className="font-bold">{usd(l.account.price)}</span>
            </div>
            {!l.account.active && <div className="px-3 pb-3 text-xs text-muted">Paused</div>}
          </div>
        ))}
      </div>
    </>
  );
}
