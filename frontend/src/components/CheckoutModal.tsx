"use client";
/**
 * Private checkout.
 *  1. Buyer types a shipping address.
 *  2. It's encrypted HERE, in the browser, to the carrier's key from Config.
 *  3. place_order sends USDC into escrow with only the encrypted blob attached.
 * The preview on the right shows exactly what the seller will see.
 */
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { placeOrder } from "@/lib/actions";
import { USDC_FAUCET_HINT } from "@/lib/contracts";
import { callDemo, DEMO_MODE } from "@/lib/demo";
import { MAX_ADDRESS_BYTES, sealAddress } from "@/lib/crypto";
import { short, usd } from "@/lib/format";
import { useUsdcBalance } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";
import { withToast } from "@/lib/tx";
import type { ConfigAccount, ListingAccount, SellerAccount, WithKey } from "@/lib/types";
import { ProductArt } from "./ProductArt";
import { TrustChip } from "./SellerTrust";
import { Button, Input } from "./ui";

type Props = {
  listing: WithKey<ListingAccount>;
  seller: SellerAccount | undefined;
  config: ConfigAccount;
  onClose: () => void;
};

export function CheckoutModal({ listing, seller, config, onClose }: Props) {
  const router = useRouter();
  const { program, wallet } = useGhostProgram();
  const { setVisible } = useWalletModal();
  const { data: balance, refresh: refreshBalance } = useUsdcBalance(config.usdcMint, wallet?.publicKey);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", street: "", city: "", postal: "", country: "" });

  const price = listing.account.price.toNumber();
  const addressText = [form.name, form.street, `${form.city} ${form.postal}`.trim(), form.country]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  const addressBytes = new TextEncoder().encode(addressText).length;
  const formComplete = form.name && form.street && form.city && form.postal && form.country;
  const tooLong = addressBytes > MAX_ADDRESS_BYTES;
  const notEnoughUsdc = balance !== null && balance < price;

  // Live preview of the ciphertext so the buyer can see what goes on-chain.
  const preview = useMemo(() => {
    if (!addressText) return "";
    try {
      const sealed = sealAddress(addressText, Uint8Array.from(config.carrierEncryptionKey));
      return Buffer.from(sealed).toString("hex").slice(0, 96) + "…";
    } catch {
      return "";
    }
  }, [addressText, config.carrierEncryptionKey]);

  async function pay() {
    if (!wallet) return setVisible(true);
    setBusy(true);
    const sealed = sealAddress(addressText, Uint8Array.from(config.carrierEncryptionKey));
    let orderKey = "";
    const sig = await withToast(`Paying ${usd(price)} into escrow`, async () => {
      const { sig, order } = await placeOrder(program, config, wallet.publicKey, listing.publicKey, sealed);
      orderKey = order.toBase58();
      return sig;
    });
    setBusy(false);
    if (sig) router.push(`/orders?new=${orderKey}`);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Private checkout"
      >
        <div className="mb-4 flex items-start gap-4">
          <ProductArt title={listing.account.title} imageUrl={listing.account.imageUrl} className="h-20 w-20 shrink-0 rounded-xl [&_span]:text-4xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{listing.account.title}</h2>
            <p className="text-sm text-muted">
              {seller?.name ?? short(listing.account.sellerAuthority)} {seller && <TrustChip seller={seller} />}
            </p>
            <p className="mt-1 text-2xl font-extrabold">{usd(price)}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* ---- Left: what YOU enter ---- */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ship to (encrypted on your device)</p>
            <Input label="Full name" value={form.name} onChange={set("name")} autoComplete="name" />
            <Input label="Street address" value={form.street} onChange={set("street")} autoComplete="street-address" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="City" value={form.city} onChange={set("city")} autoComplete="address-level2" />
              <Input label="Postal code" value={form.postal} onChange={set("postal")} autoComplete="postal-code" />
            </div>
            <Input label="Country" value={form.country} onChange={set("country")} autoComplete="country-name" />
            {tooLong && <p className="text-xs text-bad">Address too long ({addressBytes}/{MAX_ADDRESS_BYTES} bytes).</p>}
          </div>

          {/* ---- Right: what the SELLER sees ---- */}
          <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">What the seller sees</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Buyer</dt>
                <dd className="font-mono">Ghost {wallet ? short(wallet.publicKey) : "••••"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Name / phone / email</dt>
                <dd>— never shared</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Card number</dt>
                <dd>— none, paid in USDC</dd>
              </div>
              <div>
                <dt className="text-muted">Address</dt>
                <dd className="mt-1 break-all rounded-lg bg-bg p-2 font-mono text-[11px] text-accent">
                  {preview || "(encrypted blob appears here)"}
                </dd>
              </div>
            </dl>
            <ul className="space-y-1 border-t border-line pt-3 text-xs text-muted">
              <li>🔒 Only the carrier can decrypt your address.</li>
              <li>⏳ Seller is paid only after delivery + your inspection window.</li>
              <li>↩️ Not shipped in time? Refund is automatic — no claim form.</li>
            </ul>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted">
            {wallet ? (
              <>
                Your USDC: <span className="font-semibold text-ink">{balance === null ? "…" : usd(balance)}</span>
                {notEnoughUsdc &&
                  (DEMO_MODE ? (
                    <button
                      className="block text-xs font-semibold text-accent underline"
                      onClick={async () => {
                        if (await withToast("Adding $20 test USDC", () => callDemo("faucet", { wallet: wallet.publicKey.toBase58() })))
                          await refreshBalance();
                      }}
                    >
                      Get $20 test money
                    </button>
                  ) : (
                    <span className="block text-xs text-warn">Not enough USDC. {USDC_FAUCET_HINT}</span>
                  ))}
              </>
            ) : (
              "Connect a wallet to pay"
            )}
          </div>
          <Button
            onClick={pay}
            loading={busy}
            disabled={!!wallet && (!formComplete || tooLong || notEnoughUsdc)}
            className="px-6 py-3 text-base"
          >
            {wallet ? `Pay ${usd(price)} privately` : "Connect wallet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
