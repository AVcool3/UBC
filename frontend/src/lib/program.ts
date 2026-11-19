"use client";
/**
 * Creates the Anchor `Program` client the whole app uses.
 *
 * - With a connected browser wallet → transactions are signed by the wallet.
 * - Without one → a read-only client (fetching accounts works, sending doesn't).
 * - Operator pages (carrier/arbiter) can sign with a key file instead, using KeypairWallet.
 */
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";
import type { GhostCheckout } from "@/idl/ghost_checkout";
import { IDL } from "./contracts";

export type GhostProgram = Program<GhostCheckout>;

/** The minimal wallet shape Anchor needs. */
export interface SignerWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/** Wallet that signs with an in-memory keypair (used by the carrier/arbiter consoles). */
export class KeypairWallet implements SignerWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else tx.partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}

/** Placeholder signer for read-only use; any attempt to sign throws. */
const READ_ONLY: SignerWallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("Connect a wallet first");
  },
  signAllTransactions: async () => {
    throw new Error("Connect a wallet first");
  },
};

export function makeProgram(connection: Connection, wallet?: SignerWallet): GhostProgram {
  const provider = new AnchorProvider(connection, wallet ?? READ_ONLY, { commitment: "confirmed" });
  return new Program<GhostCheckout>(IDL, provider);
}

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
