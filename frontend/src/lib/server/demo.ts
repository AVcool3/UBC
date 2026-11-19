/**
 * SERVER-ONLY helpers for the demo API routes. Keys come from environment
 * variables that are never sent to the browser (no NEXT_PUBLIC_ prefix).
 *
 *   DEMO_FAUCET_KEY    mint authority of the test USDC + pays SOL top-ups
 *   DEMO_CARRIER_KEY   the carrier's signing key (confirms deliveries)
 *   DEMO_SELLER_KEYS   JSON array of demo seller keys that "ship" on autopilot
 *   DEMO_ARBITER_KEY   the config admin key (resolves disputes)
 *
 * Each key is a JSON array of 64 numbers (Solana CLI keypair format).
 * `npm run demo-env` in /contracts prints all of them, ready to paste into Vercel.
 */
import { Connection, Keypair } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { RPC_URL } from "../contracts";
import { makeProgram, KeypairWallet } from "../core";
import { configPda } from "../pda";
import { friendlyServerError } from "./errors";

export const demoEnabled = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function parseKey(json: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json)));
}

export function envKey(name: string): Keypair {
  const raw = process.env[name];
  if (!raw) throw new Error(`Demo is not configured (${name} missing)`);
  return parseKey(raw);
}

export function envKeyList(name: string): Keypair[] {
  const raw = process.env[name];
  if (!raw) return [];
  return (JSON.parse(raw) as number[][]).map((arr) => Keypair.fromSecretKey(Uint8Array.from(arr)));
}

export const serverConnection = () => new Connection(RPC_URL, "confirmed");

/** Program client that signs as `signer`. */
export const programAs = (signer: Keypair) => makeProgram(serverConnection(), new KeypairWallet(signer));

export async function fetchConfig(signer: Keypair) {
  return programAs(signer).account.config.fetch(configPda());
}

/** Wraps a route body: demo-mode check + uniform JSON errors. */
export async function demoRoute(run: () => Promise<{ sig: string; [k: string]: unknown }>) {
  if (!demoEnabled()) return NextResponse.json({ error: "Demo mode is off" }, { status: 404 });
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const status = (err as { status?: number }).status ?? 400;
    return NextResponse.json({ error: friendlyServerError(err) }, { status });
  }
}

/** Error with an HTTP status, for expected "you can't do that now" cases. */
export class DemoError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}
