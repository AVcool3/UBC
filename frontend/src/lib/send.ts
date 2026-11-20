/**
 * Sends a transaction and reports each stage honestly:
 *
 *   simulate → "failed" before signing if the program would reject it (no fee spent)
 *   signing   waiting for the wallet
 *   submitted the network has the signature; NOT yet confirmed
 *   confirmed a supermajority voted on the block (very unlikely to revert)
 *   finalized rooted; cannot be reversed
 *   failed    the program rejected it on-chain, or the blockhash expired before it landed
 *   rejected  the user cancelled in the wallet
 *   unknown   we lost contact with the RPC and can't tell yet — never shown as success
 *
 * A pending signature is kept in sessionStorage, so a page refresh in the middle
 * resumes checking the chain instead of forgetting the transaction.
 */
import { utils } from "@coral-xyz/anchor";
import type { Connection, Transaction } from "@solana/web3.js";
import { friendlyError, isWalletRejection } from "./errors";
import type { SignerWallet } from "./core";

export type Stage = "simulating" | "signing" | "submitted" | "confirmed" | "finalized" | "failed" | "rejected" | "unknown";

export interface TxUpdate {
  stage: Stage;
  label: string;
  signature?: string;
  /** Local wall-clock time of this stage (ms). */
  at: number;
  slot?: number;
  error?: string;
}

const PENDING_KEY = "held:pending-tx";
const POLL_MS = 1_000;
/** After this long with no answer from the RPC, report "unknown" (keep checking). */
const UNKNOWN_AFTER_MS = 20_000;
/** Give up waiting for "finalized" after this long (the tx is already confirmed). */
const FINALIZE_TIMEOUT_MS = 90_000;

export type PendingTx = { signature: string; label: string; lastValidBlockHeight: number; at: number };

export function readPending(): PendingTx | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingTx) : null;
  } catch {
    return null;
  }
}
function writePending(p: PendingTx | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked: we just lose refresh-resume */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Watches a submitted signature until it is finalized, fails, or expires.
 * Calls `on` for every stage change. Resolves with the last stage reached.
 */
export async function watchSignature(
  connection: Connection,
  pending: PendingTx,
  on: (u: TxUpdate) => void
): Promise<Stage> {
  const { signature, label, lastValidBlockHeight } = pending;
  let lastContact = Date.now();
  let stage: Stage = "submitted";
  let confirmedAt = 0;
  // Load-balanced RPCs can briefly disagree; only call it expired after several misses in a row.
  let expiredMisses = 0;
  for (;;) {
    try {
      const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      lastContact = Date.now();
      const s = value[0];
      if (s?.err) {
        const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
        const error = friendlyError(new Error(JSON.stringify(s.err)), tx?.meta?.logMessages ?? []);
        on({ stage: "failed", label, signature, at: Date.now(), slot: s.slot, error });
        writePending(null);
        return "failed";
      }
      if (s?.confirmationStatus === "finalized") {
        on({ stage: "finalized", label, signature, at: Date.now(), slot: s.slot });
        writePending(null);
        return "finalized";
      }
      if (s && (s.confirmationStatus === "confirmed") && stage !== "confirmed") {
        stage = "confirmed";
        confirmedAt = Date.now();
        on({ stage, label, signature, at: confirmedAt, slot: s.slot });
      }
      if (!s) {
        // Not seen yet. If the blockhash has expired, it can never land: a definite failure.
        const height = await connection.getBlockHeight("confirmed");
        expiredMisses = height > lastValidBlockHeight ? expiredMisses + 1 : 0;
        if (expiredMisses >= 5) {
          on({ stage: "failed", label, signature, at: Date.now(), error: "The transaction expired before it was processed. Nothing happened." });
          writePending(null);
          return "failed";
        }
      }
      if (stage === "unknown") {
        // Contact restored but still not confirmed: back to "submitted".
        stage = "submitted";
        on({ stage, label, signature, at: Date.now() });
      }
    } catch {
      if (Date.now() - lastContact > UNKNOWN_AFTER_MS && stage !== "unknown" && stage !== "confirmed") {
        stage = "unknown";
        on({
          stage,
          label,
          signature,
          at: Date.now(),
          error: "We lost contact with the network, so we don't know yet if this went through. Don't try again yet; we're still checking.",
        });
      }
    }
    if (stage === "confirmed" && Date.now() - confirmedAt > FINALIZE_TIMEOUT_MS) {
      writePending(null);
      return "confirmed";
    }
    await sleep(POLL_MS);
  }
}

/**
 * Simulates, asks the wallet to sign, submits, then watches.
 * Resolves as soon as the outcome is known for the user (confirmed / failed /
 * rejected / unknown); finalization keeps being reported through `on`.
 */
export async function sendTransaction(
  connection: Connection,
  wallet: SignerWallet,
  tx: Transaction,
  label: string,
  on: (u: TxUpdate) => void
): Promise<{ stage: Stage; signature?: string }> {
  const now = () => Date.now();
  on({ stage: "simulating", label, at: now() });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  // 1) Simulate: if the program would reject it, say why before anyone signs or pays.
  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      const error = friendlyError(new Error(JSON.stringify(sim.value.err)), sim.value.logs ?? []);
      on({ stage: "failed", label, at: now(), error });
      return { stage: "failed" };
    }
  } catch {
    /* simulation unavailable: continue; the chain will still enforce every rule */
  }

  // 2) Sign.
  on({ stage: "signing", label, at: now() });
  let signed: Transaction;
  try {
    signed = await wallet.signTransaction(tx);
  } catch (err) {
    const stage: Stage = isWalletRejection(err) ? "rejected" : "failed";
    on({ stage, label, at: now(), error: friendlyError(err) });
    return { stage };
  }

  // 3) Submit. The signature is known as soon as it's signed, so even a send
  //    timeout can't lose track of it.
  const signature = utils.bytes.bs58.encode(signed.signature!);
  const pending: PendingTx = { signature, label, lastValidBlockHeight, at: now() };
  writePending(pending);
  try {
    await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 5 });
  } catch {
    /* The RPC may have received it anyway; watchSignature finds out. */
  }
  on({ stage: "submitted", label, signature, at: now() });

  // 4) Watch until we can tell the user something definite.
  return new Promise((resolve) => {
    let settled = false;
    void watchSignature(connection, pending, (u) => {
      on(u);
      if (!settled && (u.stage === "confirmed" || u.stage === "failed" || u.stage === "finalized" || u.stage === "unknown")) {
        settled = true;
        resolve({ stage: u.stage, signature });
      }
    });
  });
}
