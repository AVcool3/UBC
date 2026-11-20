"use client";
/**
 * Masthead: tracked-caps wordmark on the left (like a magazine nameplate),
 * three section links with a terracotta underline for the active page,
 * then the cluster badge and the wallet button.
 */
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
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-2 px-5 py-4 sm:px-8 sm:py-5">
        {/* Wordmark — change the text or letter-spacing here. */}
        <Link href="/" className="text-[13px] font-semibold uppercase tracking-[0.28em] text-forest">
          Held<span className="text-accent">.</span>
        </Link>

        <nav aria-label="Main" className="order-3 flex w-full gap-6 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((l) => {
            const active = l.match ? pathname.startsWith(l.match) : pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                // The underline is a pseudo-element that grows from the left on hover.
                className={`relative whitespace-nowrap py-1 text-sm transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-left after:bg-accent after:transition-transform after:duration-300 ${
                  active ? "text-ink after:scale-x-100" : "text-muted after:scale-x-0 hover:text-ink hover:after:scale-x-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="kicker hidden items-center gap-1.5 sm:inline-flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-good" /> {CLUSTER}
          </span>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
