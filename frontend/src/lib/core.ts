/**
 * Program client pieces that work in BOTH the browser and server routes
 * (no React hooks here). The hook versions live in program.ts.
 */
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { HeldQuote } from "@/idl/held_quote";
import { IDL } from "./contracts";

export type HeldProgram = Program<HeldQuote>;

/** The minimal wallet shape Anchor needs. */
export interface SignerWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/** Wallet that signs with an in-memory keypair (server-side demo routes). */
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

export function makeProgram(connection: Connection, wallet?: SignerWallet): HeldProgram {
  const provider = new AnchorProvider(connection, wallet ?? READ_ONLY, { commitment: "confirmed" });
  return new Program<HeldQuote>(IDL, provider);
}
