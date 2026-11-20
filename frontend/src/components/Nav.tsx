"use client";
/** Top bar: name, three pages, cluster badge and the wallet button. */
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLUSTER, EXAMPLES } from "@/lib/contracts";

// The wallet button reads browser-only state, so render it client-side only.
const WalletMultiButton = dynamic(async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton, { ssr: false });

const LINKS = [
  { href: "/", label: "Trade" },
  { href: `/receipt/${EXAMPLES.holdExercised}`, label: "Example receipt", match: "/receipt" },
  { href: "/evidence", label: "Evidence" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent-strong text-sm text-white">
            H
          </span>
          Held
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((l) => {
            const active = l.match ? pathname.startsWith(l.match) : pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">● {CLUSTER}</span>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
