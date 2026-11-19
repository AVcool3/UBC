"use client";
/**
 * Carrier console — the ONLY place a buyer's address can be read.
 *
 * Load keys/carrier-console.json (made by `npm run init-config`). It holds:
 *  - the carrier's signing key (the only key allowed to call confirm_delivery)
 *  - the carrier's decryption key (opens the sealed addresses)
 * Both stay in this browser tab's memory.
 */
import { useConnection } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { useMemo, useState } from "react";
import nacl from "tweetnacl";
import { KeyLoader } from "@/components/KeyLoader";
import { OrderCard } from "@/components/OrderCard";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, Card, EmptyState, LoadingBlock, PageTitle } from "@/components/ui";
import { confirmDelivery } from "@/lib/actions";
import { openAddress } from "@/lib/crypto";
import { short } from "@/lib/format";
import { useConfig, useMarket, useOrders } from "@/lib/hooks";
import { KeypairWallet, makeProgram, useGhostProgram } from "@/lib/program";
import { withToast } from "@/lib/tx";
import { statusOf } from "@/lib/types";

export default function CarrierPage() {
  const { connection } = useConnection();
  const { program: readProgram } = useGhostProgram();
  const config = useConfig(readProgram);
  const market = useMarket(readProgram);
  const orders = useOrders(readProgram, "all");

  const [signer, setSigner] = useState<Keypair | null>(null);
  const [encSecret, setEncSecret] = useState<Uint8Array | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Program that signs with the carrier key file.
  const carrierProgram = useMemo(() => (signer ? makeProgram(connection, new KeypairWallet(signer)) : null), [connection, signer]);

  if (config.data === null && !config.loading) return <SetupNotice />;
  if (!config.data) return <LoadingBlock />;
  const cfg = config.data;

  // Make sure the loaded keys really belong to this marketplace's carrier.
  const signerOk = signer ? signer.publicKey.equals(cfg.carrier) : false;
  const encOk = encSecret
    ? Buffer.from(nacl.box.keyPair.fromSecretKey(encSecret).publicKey).equals(Buffer.from(cfg.carrierEncryptionKey))
    : false;

  // "ghost-checkout:order:<address>" (from the QR) or a raw address both work.
  const query = search.trim().replace(/^ghost-checkout:order:/, "");
  const queue = (orders.data ?? [])
    .filter((o) => ["shipped", "delivered"].includes(statusOf(o.account)))
    .filter((o) => !query || o.publicKey.toBase58().startsWith(query));

  return (
    <>
      <PageTitle
        title="Carrier console"
        subtitle="Decrypt shipping addresses and confirm deliveries. Sellers never see what you see here."
        right={
          <KeyLoader
            label={signer ? "Load a different key" : "Load carrier key file"}
            onLoaded={(k) => {
              setSigner(k.signer);
              setEncSecret(k.encryptionSecretKey);
              setRevealed({});
            }}
          />
        }
      />

      <Card className="mb-5 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          Signing key:{" "}
          {signer ? (
            <span className={signerOk ? "text-good" : "text-bad"}>
              {short(signer.publicKey)} {signerOk ? "✓ authorized carrier" : "✗ not this marketplace's carrier"}
            </span>
          ) : (
            <span className="text-muted">not loaded</span>
          )}
        </div>
        <div>
          Decryption key:{" "}
          {encSecret ? (
            <span className={encOk ? "text-good" : "text-bad"}>{encOk ? "✓ matches on-chain key" : "✗ doesn't match"}</span>
          ) : (
            <span className="text-muted">not loaded</span>
          )}
        </div>
        <p className="text-xs text-muted sm:col-span-2">
          File: <code>contracts/keys/carrier-console.json</code>, created by <code>npm run init-config</code>.
        </p>
      </Card>

      <input
        className="mb-4 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="Scan or paste a shipping code (ghost-checkout:order:…) to filter"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {orders.loading && !orders.data && <LoadingBlock />}
      {orders.data && queue.length === 0 && <EmptyState title="No parcels in transit">Orders appear here once sellers mark them shipped.</EmptyState>}

      <div className="space-y-3">
        {queue.map((o) => {
          const key = o.publicKey.toBase58();
          const status = statusOf(o.account);
          const listing = market.data?.listings.find((l) => l.publicKey.equals(o.account.listing))?.account;
          return (
            <OrderCard
              key={key}
              order={o}
              listing={listing}
              actions={
                status === "shipped" && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={!encOk}
                      onClick={() => {
                        const addr = openAddress(Uint8Array.from(o.account.encryptedAddress), encSecret!);
                        setRevealed((r) => ({ ...r, [key]: addr ?? "⚠ Could not decrypt with this key" }));
                      }}
                    >
                      Decrypt address
                    </Button>
                    <Button
                      disabled={!signerOk}
                      loading={busy === key}
                      onClick={async () => {
                        setBusy(key);
                        if (await withToast("Confirming delivery", () => confirmDelivery(carrierProgram!, signer!.publicKey, o.publicKey)))
                          await orders.refresh();
                        setBusy(null);
                      }}
                    >
                      Confirm delivered
                    </Button>
                  </>
                )
              }
            >
              {revealed[key] && (
                <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-accent">Ship to (decrypted locally)</div>
                  <div className="mt-1">{revealed[key]}</div>
                </div>
              )}
            </OrderCard>
          );
        })}
      </div>
    </>
  );
}
