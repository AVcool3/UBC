"use client";
/**
 * App-wide providers: Solana connection, wallet (Phantom/Solflare/Backpack are
 * auto-detected via Wallet Standard — no adapters list needed), wallet modal,
 * and toast notifications.
 */
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import { useMemo, type ReactNode } from "react";
import { Toaster } from "sonner";
import { RPC_URL } from "@/lib/contracts";
import { DEMO_MODE } from "@/lib/demo";
import { DemoWalletAdapter } from "@/lib/demoWallet";
import "@solana/wallet-adapter-react-ui/styles.css";

// Solana libraries expect Node's Buffer to exist in the browser.
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  // In demo mode, offer the no-install Demo Wallet next to any detected wallets.
  const wallets = useMemo(() => (DEMO_MODE ? [new DemoWalletAdapter()] : []), []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
          {/* Light toasts to match the paper theme; fonts come from the page. */}
          <Toaster theme="light" position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
