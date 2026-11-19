"use client";
/**
 * Creates the Anchor `Program` client the whole app uses.
 *
 * - With a connected browser wallet → transactions are signed by the wallet.
 * - Without one → a read-only client (fetching accounts works, sending doesn't).
 * - Operator pages (carrier/arbiter) can sign with a key file instead, using KeypairWallet.
 */
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { useMemo } from "react";
import { makeProgram, type GhostProgram, type SignerWallet } from "./core";

// Re-exported so pages can keep importing everything from "@/lib/program".
export { KeypairWallet, makeProgram } from "./core";
export type { GhostProgram, SignerWallet } from "./core";

/** Program bound to the connected wallet (or read-only if none). */
export function useGhostProgram(): { program: GhostProgram; wallet: SignerWallet | null } {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const program = useMemo(() => makeProgram(connection, wallet), [connection, wallet]);
  return { program, wallet: wallet ?? null };
}

/**
 * Parses a key file chosen in the browser. Accepts:
 *  - a plain Solana keypair JSON array (e.g. ~/.config/solana/id.json)
 *  - keys/carrier-console.json written by `npm run init-config`
 */
export function parseKeyFile(text: string): { signer: Keypair; encryptionSecretKey: Uint8Array | null } {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return { signer: Keypair.fromSecretKey(Uint8Array.from(data)), encryptionSecretKey: null };
  if (data?.kind === "ghost-checkout-carrier") {
    return {
      signer: Keypair.fromSecretKey(Uint8Array.from(data.signingSecretKey)),
      encryptionSecretKey: Uint8Array.from(atob(data.encryptionSecretKey), (c) => c.charCodeAt(0)),
    };
  }
  throw new Error("Unrecognised key file");
}
