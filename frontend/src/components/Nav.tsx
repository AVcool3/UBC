"use client";
/** Top navigation with wallet button, cluster badge and live USDC balance. */
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLUSTER } from "@/lib/contracts";
import { usd } from "@/lib/format";
import { useConfig, useUsdcBalance } from "@/lib/hooks";
import { useGhostProgram } from "@/lib/program";

// The wallet button reads browser-only state, so render it client-side only.
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const LINKS = [
  { href: "/", label: "Shop" },
  { href: "/orders", label: "My orders" },
  { href: "/sell", label: "Sell" },
  { href: "/carrier", label: "Carrier" },
  { href: "/arbiter", label: "Arbiter" },
];

export function Nav() {
  const pathname = usePathname();
  const { program, wallet } = useGhostProgram();
  const { data: config } = useConfig(program);
  const { data: balance } = useUsdcBalance(config?.usdcMint, wallet?.publicKey);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span aria-hidden>👻</span> Ghost Checkout
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                pathname === l.href ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full border border-line px-2.5 py-1 text-xs text-muted sm:inline">{CLUSTER}</span>
          {wallet && balance !== null && (
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold" title="Your USDC balance">
              {usd(balance)}
            </span>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
