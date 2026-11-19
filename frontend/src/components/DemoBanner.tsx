"use client";
/**
 * "Try it in 30 seconds" — shown only in demo mode.
 * Step 1 creates a no-install Demo Wallet, step 2 drops test USDC into it
 * (SOL for fees is added silently, so the user never sees "gas").
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { callDemo, DEMO_MODE } from "@/lib/demo";
import { DemoWalletName } from "@/lib/demoWallet";
import { usd } from "@/lib/format";
import { useConfig, useUsdcBalance } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";
import { withToast } from "@/lib/tx";
import { Button } from "./ui";

export function DemoBanner() {
  const { select, publicKey } = useWallet();
  const { program } = useGhostProgram();
  const { data: config } = useConfig(program);
  const balance = useUsdcBalance(config?.usdcMint, publicKey);
  const [busy, setBusy] = useState(false);

  if (!DEMO_MODE) return null;
  const funded = (balance.data ?? 0) >= 1_000_000;

  async function fund() {
    if (!publicKey) return;
    setBusy(true);
    if (await withToast("Adding $20 test USDC", () => callDemo("faucet", { wallet: publicKey.toBase58() }))) {
      await balance.refresh();
    }
    setBusy(false);
  }

  const Step = ({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) => (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ${done ? "bg-good/10" : "bg-bg/50"}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-good text-bg" : "bg-surface-2"}`}>
        {done ? "✓" : n}
      </span>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  );

  return (
    <section className="mb-6 rounded-3xl border border-accent/40 bg-accent/10 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Try it in 30 seconds — no wallet app, no crypto needed</h2>
        <span className="text-xs text-muted">Test network · play money</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Step n={1} done={!!publicKey}>
          {publicKey ? (
            "Demo account ready"
          ) : (
            <Button className="w-full" onClick={() => select(DemoWalletName)}>
              Create demo account
            </Button>
          )}
        </Step>
        <Step n={2} done={funded}>
          {funded ? (
            `You have ${usd(balance.data ?? 0)} to spend`
          ) : (
            <Button className="w-full" disabled={!publicKey} loading={busy} onClick={fund}>
              Get $20 test money
            </Button>
          )}
        </Step>
        <Step n={3} done={false}>
          Tap <b>Buy privately</b> on anything below. Then in <b>My orders</b>, use the ▶ buttons to play the seller and carrier.
        </Step>
      </div>
    </section>
  );
}
