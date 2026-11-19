"use client";
/**
 * Buyer dashboard: every order this wallet placed, live from the chain,
 * with the actions the program allows at each stage.
 */
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { OrderCard } from "@/components/OrderCard";
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, PageTitle } from "@/components/ui";
import { openDispute, refundUnshipped, releasePayment } from "@/lib/actions";
import { callDemo, DEMO_MODE } from "@/lib/demo";
import { relative } from "@/lib/format";
import { useConfig, useMarket, useNow, useOrders } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";
import { withToast } from "@/lib/tx";
import { statusOf, type OrderAccount, type WithKey } from "@/lib/types";

function OrdersInner() {
  const highlight = useSearchParams().get("new");
  const { program, wallet } = useGhostProgram();
  const { setVisible } = useWalletModal();
  const config = useConfig(program);
  const market = useMarket(program);
  const orders = useOrders(program, wallet ? { buyer: wallet.publicKey } : null);
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);

  if (!wallet) {
    return (
      <Card className="text-center">
        <p className="mb-3">Connect your wallet to see your orders.</p>
        <Button onClick={() => setVisible(true)}>Connect wallet</Button>
      </Card>
    );
  }

  /** Runs an action for one order, then refreshes the list. */
  const act = async (key: string, label: string, send: () => Promise<string>) => {
    setBusy(key + label);
    if (await withToast(label, send)) await orders.refresh();
    setBusy(null);
  };

  function buyerControls(o: WithKey<OrderAccount>) {
    const a = o.account;
    const key = o.publicKey.toBase58();
    const status = statusOf(a);
    const cfg = config.data;
    if (!cfg) return { info: null, actions: null };

    if (status === "paid") {
      const late = now > a.shipDeadline.toNumber();
      return {
        info: late ? (
          <span className="text-bad">Seller missed the shipping deadline. You can take your money back now.</span>
        ) : (
          <span className="text-muted">Seller must ship {relative(a.shipDeadline.toNumber(), now)} — or you&apos;re refunded.</span>
        ),
        actions: late ? (
          <Button
            loading={busy === key + "Refunding"}
            onClick={() => act(key, "Refunding", () => refundUnshipped(program, cfg, wallet!.publicKey, o.publicKey, a))}
          >
            Get my refund
          </Button>
        ) : (
          DEMO_MODE && (
            <Button
              variant="secondary"
              loading={busy === key + "Seller shipping (simulated)"}
              onClick={() => act(key, "Seller shipping (simulated)", () => callDemo("advance", { order: key }))}
            >
              ▶ Play seller: ship it
            </Button>
          )
        ),
      };
    }
    if (status === "shipped")
      return {
        info: <span className="text-muted">On its way. The carrier confirms delivery.</span>,
        actions: DEMO_MODE && (
          <Button
            variant="secondary"
            loading={busy === key + "Carrier delivering (simulated)"}
            onClick={() => act(key, "Carrier delivering (simulated)", () => callDemo("advance", { order: key }))}
          >
            ▶ Play carrier: deliver it
          </Button>
        ),
      };
    if (status === "delivered") {
      const open = now < a.releaseAfter.toNumber();
      return {
        info: open ? (
          <span className="text-muted">
            Check your item. Seller is paid automatically {relative(a.releaseAfter.toNumber(), now)} unless you report a problem.
          </span>
        ) : (
          <span className="text-muted">Inspection window over — payment can be released to the seller.</span>
        ),
        actions: (
          <>
            <Button
              loading={busy === key + "Paying seller"}
              onClick={() => act(key, "Paying seller", () => releasePayment(program, cfg, wallet!.publicKey, o.publicKey, a))}
            >
              {open ? "Looks good — pay seller" : "Release payment"}
            </Button>
            {open && (
              <Button
                variant="danger"
                loading={busy === key + "Opening dispute"}
                onClick={() => act(key, "Opening dispute", () => openDispute(program, wallet!.publicKey, o.publicKey))}
              >
                Fake / broken? Report
              </Button>
            )}
          </>
        ),
      };
    }
    if (status === "disputed")
      return {
        info: <span className="text-warn">The arbiter is reviewing your dispute. Funds are frozen in escrow.</span>,
        actions: DEMO_MODE && (
          <>
            <Button
              variant="secondary"
              loading={busy === key + "Arbiter refunding (simulated)"}
              onClick={() => act(key, "Arbiter refunding (simulated)", () => callDemo("arbiter", { order: key, refundBuyer: true }))}
            >
              ▶ Play arbiter: refund me
            </Button>
            <Button
              variant="ghost"
              loading={busy === key + "Arbiter paying seller (simulated)"}
              onClick={() => act(key, "Arbiter paying seller (simulated)", () => callDemo("arbiter", { order: key, refundBuyer: false }))}
            >
              ▶ Side with seller
            </Button>
          </>
        ),
      };
    return { info: null, actions: null };
  }

  return (
    <>
      <PageTitle title="My orders" subtitle="Your money sits in escrow on Solana until each order is delivered." />
      {orders.error && <ErrorBlock error={orders.error} onRetry={orders.refresh} />}
      {orders.loading && !orders.data && <LoadingBlock />}
      {orders.data?.length === 0 && <EmptyState title="No orders yet">Buy something from the Shop tab.</EmptyState>}
      <div className="space-y-3">
        {orders.data?.map((o) => {
          const { info, actions } = buyerControls(o);
          const listing = market.data?.listings.find((l) => l.publicKey.equals(o.account.listing))?.account;
          return (
            <OrderCard
              key={o.publicKey.toBase58()}
              order={o}
              listing={listing}
              highlight={highlight === o.publicKey.toBase58()}
              info={info}
              actions={actions}
            >
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                🔒 Your address is stored only as {o.account.encryptedAddress.length} encrypted bytes. The seller can&apos;t read it.
              </p>
            </OrderCard>
          );
        })}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <OrdersInner />
    </Suspense>
  );
}
