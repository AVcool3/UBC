/**
 * SERVER-ONLY helpers for Solana Actions / Blinks (spec v2.4).
 *
 * A Blink is a link that wallets and social clients (X with Phantom/Backpack,
 * dial.to, …) unfurl into an interactive card. The protocol is just HTTP:
 *   GET  /api/actions/...  → card metadata (image, title, buttons, input fields)
 *   POST /api/actions/...  → { account } in, an unsigned transaction out
 * The user's own wallet signs and sends it. Our server never holds the buyer's keys.
 *
 * Every Actions response needs permissive CORS (any site can render the card)
 * plus two headers that say which spec version and which chain we speak.
 */
import { NextResponse } from "next/server";
import { CLUSTER } from "../contracts";

/** CAIP-2 chain IDs from the spec. Blink clients use this to pick the right network. */
const BLOCKCHAIN_IDS: Record<string, string> = {
  "mainnet-beta": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

export const ACTION_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "Content-Type": "application/json",
  "X-Action-Version": "2.4",
  // Localnet has no public chain ID; clients just won't filter by chain.
  ...(BLOCKCHAIN_IDS[CLUSTER] ? { "X-Blockchain-Ids": BLOCKCHAIN_IDS[CLUSTER] } : {}),
};

/** JSON response with the Actions headers. */
export const actionJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: ACTION_HEADERS });

/** Spec-shaped error ({ message }) that blink clients show to the user. */
export const actionError = (message: string, status = 400) => actionJson({ message }, status);

/** Answer for CORS preflight (OPTIONS) requests. */
export const actionPreflight = () => new Response(null, { status: 204, headers: ACTION_HEADERS });

/**
 * Public origin of this deployment (e.g. https://ghost-checkout.vercel.app).
 * Blink clients need absolute URLs for images and links, and behind Vercel's
 * proxy `req.url` can be an internal address, so trust the forwarded headers.
 */
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Thrown inside a route for expected problems; becomes an ActionError response. */
export class ActionProblem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
