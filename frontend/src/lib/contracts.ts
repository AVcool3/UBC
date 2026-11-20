/**
 * Every public identifier the app uses, in one place.
 *
 * Program, market, maker and mints are PINNED from src/deployment.json (written
 * by `npm run seed-market` in /contracts). They can be overridden with the
 * NEXT_PUBLIC_HELD_* env vars, but by default a build always points at the
 * exact accounts it was tested against. Nothing here is secret.
 */
import { PublicKey } from "@solana/web3.js";
import deployment from "@/deployment.json";
import idlJson from "@/idl/held_quote.json";
import type { HeldQuote } from "@/idl/held_quote";

export type Cluster = "devnet" | "localnet" | "mainnet-beta";

export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || deployment.cluster) as Cluster;

const pk = (envValue: string | undefined, pinned: string) => new PublicKey(envValue || pinned);

export const PROGRAM_ID = pk(process.env.NEXT_PUBLIC_HELD_PROGRAM_ID, deployment.programId);
export const MARKET = pk(process.env.NEXT_PUBLIC_HELD_MARKET, deployment.market);
export const MAKER = pk(process.env.NEXT_PUBLIC_HELD_MAKER, deployment.maker);
export const COLLATERAL_MINT = pk(process.env.NEXT_PUBLIC_HELD_COLLATERAL_MINT, deployment.collateralMint);

/** The IDL with its address set to PROGRAM_ID, ready for `new Program(IDL, provider)`. */
export const IDL = { ...idlJson, address: PROGRAM_ID.toBase58() } as HeldQuote;

/** Display-only reference market (never executable here). */
export const REFERENCE = deployment.reference;
/** Real example transactions captured when the demo was seeded (for the wallet-free receipt path). */
export const EXAMPLES = deployment.examples;

// Units — must match contracts/programs/held_quote/src/state.rs.
export const COLLATERAL_DECIMALS = 6;
export const SHARE_UNIT = 1_000_000; // $1.00 per complete set
export const PRICE_TICK = 10_000; // $0.01

// ---------------------------------------------------------------------------
// Solana Explorer links (cluster always explicit, so a devnet link never opens mainnet)
// ---------------------------------------------------------------------------
function clusterQuery(): string {
  if (CLUSTER === "mainnet-beta") return "";
  if (CLUSTER === "localnet") return `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `?cluster=${CLUSTER}`;
}
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${clusterQuery()}`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}${clusterQuery()}`;
