/**
 * SERVER-ONLY helpers for the demo API routes. Keys come from environment
 * variables that are never sent to the browser (no NEXT_PUBLIC_ prefix).
 *
 *   DEMO_FAUCET_KEY   mint authority of the test USDC; also tops up SOL for fees
 *   DEMO_MAKER_KEY    the test maker (falls back to the first key in DEMO_SELLER_KEYS,
 *                     which is what the earlier deployment already configured)
 *
 * Each key is a JSON array of 64 numbers (Solana CLI keypair format).
 * These are DEVNET test keys. Their only powers: mint test USDC, and set the
 * test maker's ask. They can't touch anyone's held price — the program forbids it.
 */
import { Connection, Keypair } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { RPC_URL } from "../contracts";
import { makeProgram, KeypairWallet } from "../core";
import { friendlyServerError } from "./errors";

export const demoEnabled = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const parseKey = (json: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json)));

export function envKey(name: string): Keypair {
  const raw = process.env[name];
  if (!raw) throw new DemoError(`Demo is not configured (${name} missing)`, 503);
  return parseKey(raw);
}

export function makerKey(): Keypair {
  if (process.env.DEMO_MAKER_KEY) return parseKey(process.env.DEMO_MAKER_KEY);
  const list = process.env.DEMO_SELLER_KEYS;
  if (list) return Keypair.fromSecretKey(Uint8Array.from((JSON.parse(list) as number[][])[0]));
  throw new DemoError("Demo is not configured (DEMO_MAKER_KEY missing)", 503);
}

export const serverConnection = () => new Connection(RPC_URL, "confirmed");

/** Program client that signs as `signer`. */
export const programAs = (signer: Keypair) => makeProgram(serverConnection(), new KeypairWallet(signer));

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
