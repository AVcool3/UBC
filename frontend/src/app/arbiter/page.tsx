"use client";
/**
 * Arbiter console — resolves disputes ("it's counterfeit", "it arrived broken").
 * Signs with the admin wallet: either connect it, or load its keypair file
 * (e.g. ~/.config/solana/id.json used to run init-config).
 * Every decision is written to the seller's permanent record.
 */
import { useConnection } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { KeyLoader } from "@/components/KeyLoader";
import { OrderCard } from "@/components/OrderCard";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, Card, EmptyState, LoadingBlock, PageTitle } from "@/components/ui";
import { resolveDispute } from "@/lib/actions";
import { explorerAddress } from "@/lib/contracts";
import { short } from "@/lib/format";
import { useConfig, useMarket, useOrders } from "@/lib/hooks";
import { KeypairWallet, makeProgram, useGhostProgram } from "@/lib/program";
import { withToast } from "@/lib/tx";
import { statusOf } from "@/lib/types";

export default function ArbiterPage() {
  const { connection } = useConnection();
  const { program: walletProgram, wallet } = useGhostProgram();
  const config = useConfig(walletProgram);
  const market = useMarket(walletProgram);
  const orders = useOrders(walletProgram, "all");
  const [keyFileSigner, setKeyFileSigner] = useState<Keypair | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fileProgram = useMemo(
    () => (keyFileSigner ? makeProgram(connection, new KeypairWallet(keyFileSigner)) : null),
    [connection, keyFileSigner]
  );

  if (config.data === null && !config.loading) return <SetupNotice />;
  if (!config.data) return <LoadingBlock />;
  const cfg = config.data;

  // Prefer the connected wallet if it's the admin, otherwise the loaded key file.
  const walletIsAdmin = !!wallet && wallet.publicKey.equals(cfg.admin);
  const fileIsAdmin = !!keyFileSigner && keyFileSigner.publicKey.equals(cfg.admin);
  const signerProgram = walletIsAdmin ? walletProgram : fileIsAdmin ? fileProgram : null;
  const signerKey = walletIsAdmin ? wallet!.publicKey : fileIsAdmin ? keyFileSigner!.publicKey : null;

  const disputes = (orders.data ?? []).filter((o) => statusOf(o.account) === "disputed");

  async function decide(orderKey: string, refundBuyer: boolean) {
    const o = disputes.find((d) => d.publicKey.toBase58() === orderKey)!;
    setBusy(orderKey + refundBuyer);
    const label = refundBuyer ? "Refunding buyer" : "Paying seller";
    if (await withToast(label, () => resolveDispute(signerProgram!, cfg, signerKey!, o.publicKey, o.account, refundBuyer)))
      await orders.refresh();
    setBusy(null);
  }

  return (
    <>
      <PageTitle
        title="Arbiter"
        subtitle="Decide disputed orders. Outcomes are permanent and public on the seller's record."
        right={!walletIsAdmin && <KeyLoader label="Load admin key file" onLoaded={(k) => setKeyFileSigner(k.signer)} />}
      />

      <Card className="mb-5 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          Arbiter (admin):{" "}
          <a className="font-mono underline" href={explorerAddress(cfg.admin.toBase58())} target="_blank" rel="noreferrer">
            {short(cfg.admin)}
          </a>
        </div>
        <div>
          You:{" "}
          {signerKey ? <span className="text-good">✓ signing as arbiter</span> : <span className="text-muted">view only — connect or load the admin key</span>}
        </div>
        <div className="text-muted">Ship window: {cfg.shipWindowSecs.toString()}s</div>
        <div className="text-muted">Inspection window: {cfg.inspectionWindowSecs.toString()}s</div>
      </Card>

      {orders.loading && !orders.data && <LoadingBlock />}
      {orders.data && disputes.length === 0 && <EmptyState title="No open disputes">🎉 Nothing to review.</EmptyState>}

      <div className="space-y-3">
        {disputes.map((o) => {
          const key = o.publicKey.toBase58();
          const listing = market.data?.listings.find((l) => l.publicKey.equals(o.account.listing))?.account;
          const seller = market.data?.sellers.get(o.account.sellerAuthority.toBase58())?.account;
          return (
            <OrderCard
              key={key}
              order={o}
              listing={listing}
              info={<span className="text-muted">Seller: {seller?.name ?? short(o.account.sellerAuthority)}</span>}
              actions={
                <>
                  <Button variant="danger" disabled={!signerProgram} loading={busy === key + "true"} onClick={() => decide(key, true)}>
                    Refund buyer
                  </Button>
                  <Button variant="secondary" disabled={!signerProgram} loading={busy === key + "false"} onClick={() => decide(key, false)}>
                    Pay seller
                  </Button>
                </>
              }
            />
          );
        })}
      </div>
    </>
  );
}
