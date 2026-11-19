"use client";
/**
 * Wraps every on-chain action with toast notifications:
 *   loading ("Approve in your wallet…") → success (with Explorer link) → or a readable error.
 */
import { toast } from "sonner";
import idlJson from "@/idl/ghost_checkout.json";
import { explorerTx } from "./contracts";

// Program error codes from the IDL, so raw "custom program error: 0x1770" becomes readable.
const PROGRAM_ERRORS = new Map<number, string>(
  (idlJson.errors ?? []).map((e: { code: number; msg?: string; name: string }) => [e.code, e.msg ?? e.name])
);

export function friendlyError(err: unknown): string {
  const e = err as { error?: { errorMessage?: string }; message?: string; logs?: string[] };
  if (e?.error?.errorMessage) return e.error.errorMessage; // AnchorError from our program
  const msg = String(e?.message ?? err);

  if (/user rejected|rejected the request|declined/i.test(msg)) return "You cancelled the request in your wallet.";
  if (/insufficient funds|insufficient lamports|0x1\b/i.test(msg)) return "Not enough funds (SOL for fees, or USDC).";
  if (/blockhash not found|block height exceeded/i.test(msg)) return "Network was slow — please try again.";

  const hex = msg.match(/custom program error: (0x[0-9a-f]+)/i);
  if (hex) {
    const code = parseInt(hex[1], 16);
    if (PROGRAM_ERRORS.has(code)) return PROGRAM_ERRORS.get(code)!;
  }
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

/** Runs `send` and shows toasts. Returns the signature, or null if it failed. */
export async function withToast(label: string, send: () => Promise<string>): Promise<string | null> {
  const id = toast.loading(`${label}…`, { description: "Approve in your wallet" });
  try {
    const sig = await send();
    toast.success(label, {
      id,
      description: "Confirmed on Solana",
      action: { label: "Explorer ↗", onClick: () => window.open(explorerTx(sig), "_blank") },
    });
    return sig;
  } catch (err) {
    console.error(err);
    toast.error(`${label} failed`, { id, description: friendlyError(err) });
    return null;
  }
}
