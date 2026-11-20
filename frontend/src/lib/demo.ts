/**
 * Demo-mode switches and the browser side of the demo API.
 *
 * Demo mode (NEXT_PUBLIC_DEMO_MODE=true) lets someone try everything alone:
 *  - a no-install Demo Wallet (key kept in this browser; devnet only),
 *  - a faucet for test USDC (and SOL for fees),
 *  - a clearly labelled "simulate a maker reprice" button.
 * The on-chain rules are exactly the same as for any wallet.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Calls a /api/demo/* route; resolves to the transaction signature, throws a readable error. */
export async function callDemo(path: "faucet" | "reprice", body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`/api/demo/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { sig?: string; error?: string };
  if (!res.ok || !data.sig) throw new Error(data.error ?? `Demo request failed (${res.status})`);
  return data.sig;
}
