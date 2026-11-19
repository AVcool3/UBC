/**
 * Typed contract config — the one place the frontend learns where the program
 * lives. Paste your deployed program ID into .env.local (NEXT_PUBLIC_PROGRAM_ID)
 * and everything else is read from the chain (USDC mint, carrier key, windows).
 */
import { PublicKey } from "@solana/web3.js";
import idlJson from "@/idl/ghost_checkout.json";
import type { GhostCheckout } from "@/idl/ghost_checkout";

export type Cluster = "devnet" | "localnet" | "mainnet-beta";

export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet") as Cluster;

/** Program ID: env override, otherwise the address baked into the IDL by `anchor build`. */
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || idlJson.address);

/** The IDL with its address swapped to PROGRAM_ID, ready for `new Program(IDL, provider)`. */
export const IDL = { ...idlJson, address: PROGRAM_ID.toBase58() } as GhostCheckout;

export const USDC_DECIMALS = 6;

/** Where to get test USDC for the current cluster. */
export const USDC_FAUCET_HINT =
  CLUSTER === "devnet"
    ? "Get free devnet USDC at faucet.circle.com (choose Solana Devnet)."
    : CLUSTER === "localnet"
      ? "Run: npx tsx scripts/faucet.ts <your-wallet> in /contracts."
      : "Fund your wallet with USDC.";

// ---------------------------------------------------------------------------
// Solana Explorer links
// ---------------------------------------------------------------------------
function clusterQuery(): string {
  if (CLUSTER === "mainnet-beta") return "";
  if (CLUSTER === "localnet") return `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `?cluster=${CLUSTER}`;
}
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${clusterQuery()}`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}${clusterQuery()}`;
