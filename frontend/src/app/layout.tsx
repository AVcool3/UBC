import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Held · buy now or hold the price",
  description:
    "Buy binary outcome shares now, or pay a small disclosed fee to hold the executable price for a few seconds. The held shares sit in program custody on Solana, so the price can't be pulled.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent-strong focus:px-4 focus:py-2">
            Skip to content
          </a>
          <Nav />
          <main id="main" className="mx-auto max-w-6xl px-4 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
