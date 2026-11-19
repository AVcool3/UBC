"use client";
/**
 * App-wide providers: Solana connection, wallet (Phantom/Solflare/Backpack are
 * auto-detected via Wallet Standard — no adapters list needed), wallet modal,
 * and toast notifications.
 */
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { RPC_URL } from "@/lib/contracts";
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
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          {children}
          <Toaster theme="dark" position="bottom-right" richColors closeButton />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
