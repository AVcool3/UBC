"use client";
/**
 * Seller dashboard.
 *  - Register a seller profile (your public, on-chain track record).
 *  - Create / pause listings.
 *  - Fulfil orders: you get an anonymous order code + a QR shipping code,
 *    never the buyer's name or address.
 */
import { BN } from "@coral-xyz/anchor";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { OrderCard } from "@/components/OrderCard";
import { ProductArt } from "@/components/ProductArt";
import { TrustStats } from "@/components/SellerTrust";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, Card, EmptyState, Input, LoadingBlock, PageTitle } from "@/components/ui";
import {
  cancelOrder,
  createListing,
  markShipped,
  registerSeller,
  releasePayment,
  setListingActive,
} from "@/lib/actions";
import { sha256Bytes } from "@/lib/crypto";
import { orderCode, parseUsd, relative, short, usd } from "@/lib/format";
import { useConfig, useMarket, useNow, useOrders, useSellerProfile } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";
import { withToast } from "@/lib/tx";
import { statusOf, type OrderAccount, type WithKey } from "@/lib/types";

export default function SellPage() {
  const { program, wallet } = useGhostProgram();
  const { setVisible } = useWalletModal();
  const config = useConfig(program);
  const profile = useSellerProfile(program, wallet?.publicKey ?? null);
  const market = useMarket(program);
  const orders = useOrders(program, wallet ? { seller: wallet.publicKey } : null);
  const now = useNow();

  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState({ title: "", imageUrl: "", price: "" });
  const [tracking, setTracking] = useState<Record<string, string>>({});

  if (!wallet) {
    return (
      <Card className="text-center">
        <p className="mb-3">Connect the wallet you want to sell from.</p>
        <Button onClick={() => setVisible(true)}>Connect wallet</Button>
      </Card>
    );
  }
  if (config.data === null && !config.loading) return <SetupNotice />;
  if (profile.loading && profile.data === null) return <LoadingBlock />;

  const me = wallet.publicKey;
  const run = async (key: string, label: string, send: () => Promise<string>, after?: () => void) => {
    setBusy(key);
    const ok = await withToast(label, send);
    if (ok) {
      after?.();
      await Promise.all([profile.refresh(), market.refresh(), orders.refresh()]);
    }
    setBusy(null);
  };

  // ---------------- Not registered yet ----------------
  if (!profile.data) {
    return (
      <div className="mx-auto max-w-lg">
        <PageTitle title="Become a seller" subtitle="Your profile is an on-chain record built only from real orders." />
        <Card className="space-y-4">
          <Input label="Shop name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glow Lab Skincare" />
          <Button
            className="w-full"
            disabled={!name.trim()}
            loading={busy === "register"}
            onClick={() => run("register", "Creating seller profile", () => registerSeller(program, me, name.trim()))}
          >
            Create seller profile
          </Button>
        </Card>
      </div>
    );
  }

  // ---------------- Dashboard ----------------
  const seller = profile.data;
  const myListings = market.data?.listings.filter((l) => l.account.sellerAuthority.equals(me)) ?? [];
  const price = parseUsd(draft.price);
  const listingTitle = (o: WithKey<OrderAccount>) => market.data?.listings.find((l) => l.publicKey.equals(o.account.listing))?.account;

  function sellerControls(o: WithKey<OrderAccount>) {
    const a = o.account;
    const key = o.publicKey.toBase58();
    const cfg = config.data;
    const status = statusOf(a);
    if (!cfg) return {};

    if (status === "paid") {
      const late = now > a.shipDeadline.toNumber();
      if (late) return { info: <span className="text-bad">Shipping deadline missed — the buyer can take a refund.</span> };
      return {
        info: <span className="text-muted">Ship {relative(a.shipDeadline.toNumber(), now)} or the buyer is auto-refunded.</span>,
        actions: (
          <Button
            variant="danger"
            loading={busy === key + "cancel"}
            onClick={() => run(key + "cancel", "Cancelling & refunding buyer", () => cancelOrder(program, cfg, o.publicKey, a))}
          >
            Can&apos;t fulfil — refund
          </Button>
        ),
        body: (
          <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-[auto_1fr]">
            <div className="rounded-xl bg-white p-2">
              <QRCodeSVG value={`ghost-checkout:order:${key}`} size={96} />
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted">
                Shipping code for <span className="font-mono text-ink">{orderCode(o.publicKey)}</span>. The carrier scans it and
                prints the label — <b className="text-ink">you never see the buyer&apos;s address</b>.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="Carrier tracking number"
                  value={tracking[key] ?? ""}
                  onChange={(e) => setTracking((t) => ({ ...t, [key]: e.target.value }))}
                />
                <Button
                  disabled={!tracking[key]?.trim()}
                  loading={busy === key + "ship"}
                  onClick={() =>
                    run(key + "ship", "Marking as shipped", async () =>
                      markShipped(program, me, o.publicKey, await sha256Bytes(tracking[key]))
                    )
                  }
                >
                  Mark shipped
                </Button>
              </div>
              <p className="text-xs text-muted">Only a hash of the tracking number is stored on-chain.</p>
            </div>
          </div>
        ),
      };
    }
    if (status === "shipped") return { info: <span className="text-muted">Waiting for the carrier to confirm delivery.</span> };
    if (status === "delivered") {
      const open = now < a.releaseAfter.toNumber();
      return {
        info: open ? (
          <span className="text-muted">Delivered. Buyer&apos;s inspection window ends {relative(a.releaseAfter.toNumber(), now)}.</span>
        ) : (
          <span className="text-good">Inspection window over — collect your payment.</span>
        ),
        actions: !open && (
          <Button
            loading={busy === key + "collect"}
            onClick={() => run(key + "collect", "Collecting payment", () => releasePayment(program, cfg, me, o.publicKey, a))}
          >
            Collect {usd(a.amount)}
          </Button>
        ),
      };
    }
    if (status === "disputed") return { info: <span className="text-warn">Buyer opened a dispute. The arbiter will decide.</span> };
    return {};
  }

  return (
    <>
      <PageTitle
        title={seller.name}
        subtitle={<>Seller wallet <span className="font-mono">{short(me)}</span> · record below is written by the program, not by you.</>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* ---- Orders ---- */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Orders</h2>
            {orders.loading && !orders.data && <LoadingBlock />}
            {orders.data?.length === 0 && <EmptyState title="No orders yet">Share your listings to get your first sale.</EmptyState>}
            <div className="space-y-3">
              {orders.data?.map((o) => {
                const c = sellerControls(o);
                return (
                  <OrderCard key={o.publicKey.toBase58()} order={o} listing={listingTitle(o)} info={c.info} actions={c.actions}>
                    <p className="mt-2 text-xs text-muted">
                      Buyer: <span className="font-mono">Ghost {short(o.account.buyer)}</span> · name, card & address hidden
                    </p>
                    {c.body}
                  </OrderCard>
                );
              })}
            </div>
          </section>

          {/* ---- Listings ---- */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">My listings</h2>
            {myListings.length === 0 && <EmptyState title="No listings yet">Create one on the right.</EmptyState>}
            <div className="grid gap-3 sm:grid-cols-2">
              {myListings.map((l) => (
                <div key={l.publicKey.toBase58()} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
                  <ProductArt title={l.account.title} imageUrl={l.account.imageUrl} className="h-16 w-16 shrink-0 rounded-xl [&_span]:text-3xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{l.account.title}</div>
                    <div className="text-sm text-muted">
                      {usd(l.account.price)} · {l.account.ordersPlaced.toString()}{" "}
                      {l.account.ordersPlaced.toNumber() === 1 ? "order" : "orders"} · {l.account.active ? "live" : "paused"}
                    </div>
                    <Button
                      variant="ghost"
                      className="!px-0"
                      loading={busy === l.publicKey.toBase58()}
                      onClick={() =>
                        run(l.publicKey.toBase58(), l.account.active ? "Pausing listing" : "Resuming listing", () =>
                          setListingActive(program, me, l.publicKey, !l.account.active)
                        )
                      }
                    >
                      {l.account.active ? "Pause" : "Resume"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="mb-3 font-semibold">Your verifiable record</h2>
            <TrustStats seller={seller} />
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">New listing</h2>
            <Input label="Title" maxLength={64} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <Input
              label="Image URL (optional)"
              maxLength={200}
              value={draft.imageUrl}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              hint="Leave empty for an auto-generated cover."
            />
            <Input
              label="Price (USDC)"
              inputMode="decimal"
              placeholder="12.99"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
            <Button
              className="w-full"
              disabled={!draft.title.trim() || !price}
              loading={busy === "list"}
              onClick={() =>
                run(
                  "list",
                  "Publishing listing",
                  () => createListing(program, me, new BN(seller.listingCount), draft.title.trim(), draft.imageUrl.trim(), price!),
                  () => setDraft({ title: "", imageUrl: "", price: "" })
                )
              }
            >
              Publish listing
            </Button>
          </Card>
        </aside>
      </div>
    </>
  );
}
