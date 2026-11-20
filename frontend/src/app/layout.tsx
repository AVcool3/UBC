import type { Metadata } from "next";
import { Alegreya, Crimson_Pro, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import "./globals.css";

/*
 * Fonts — loaded and self-hosted by next/font at build time (no layout shift).
 * Each one is exposed as a CSS variable, which globals.css maps to the
 * Tailwind families: font-display, font-serif, font-sans, font-mono.
 * To try a different typeface, change the import + call here only.
 */
const crimson = Crimson_Pro({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-crimson" }); // headlines
const alegreya = Alegreya({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-alegreya" }); // prose
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" }); // UI + numbers
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" }); // addresses

export const metadata: Metadata = {
  title: "Held · buy now or hold the price",
  description:
    "Buy binary outcome shares now, or pay a small disclosed fee to hold the executable price for a few seconds. The held shares sit in program custody on Solana, so the price can't be pulled.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${crimson.variable} ${alegreya.variable} ${dmSans.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
            Skip to content
          </a>
          <Nav />
          {/* Generous top/bottom padding: the editorial look needs air. */}
          <main id="main" className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
            {children}
          </main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 sm:px-8">
              <span className="kicker text-forest">Held</span>
              <span className="kicker">Devnet · test assets only · receipts verifiable by anyone</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
