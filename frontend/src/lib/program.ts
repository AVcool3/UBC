"use client";
/**
 * The Anchor `Program` client the app uses.
 * - With a connected wallet: transactions are signed by that wallet.
 * - Without one: a read-only client (reading accounts works, sending doesn't),
 *   which is all the wallet-free receipt page needs.
 */
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { makeProgram, type HeldProgram, type SignerWallet } from "./core";

export { makeProgram } from "./core";
export type { HeldProgram, SignerWallet } from "./core";

export function useHeldProgram(): { program: HeldProgram; wallet: SignerWallet | null } {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const program = useMemo(() => makeProgram(connection, wallet), [connection, wallet]);
  return { program, wallet: wallet ?? null };
}
