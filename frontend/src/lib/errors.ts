/**
 * Turns program / wallet / RPC errors into one plain sentence.
 * Program error codes come straight from the IDL, so they stay in sync with errors.rs.
 */
import idlJson from "@/idl/held_quote.json";

const PROGRAM_ERRORS = new Map<number, { name: string; msg: string }>(
  (idlJson.errors ?? []).map((e: { code: number; name: string; msg?: string }) => [e.code, { name: e.name, msg: e.msg ?? e.name }])
);

/** Plain-language overrides for the errors buyers actually hit. */
const BUYER_COPY: Record<string, string> = {
  PriceAboveLimit: "The price is now above your max. Nothing was bought and no USDC was charged.",
  InsufficientInventory: "Not enough shares are available at this price right now.",
  HoldExpired: "This hold has expired. No shares were bought; the fee is kept by the maker.",
  FeeAboveLimit: "The hold fee changed above what you approved. Nothing was charged.",
  MarketClosed: "Trading is closed for this market.",
  MarketResolved: "This market is resolved, so trading has stopped.",
  HoldTooLarge: "One hold can reserve at most 100 shares. Hold fewer, or buy now.",
};

export type ProgramErrorInfo = { name: string; message: string } | null;

/** Finds our program's error in logs or an error message ("custom program error: 0x1770"). */
export function programErrorFrom(text: string): ProgramErrorInfo {
  const named = text.match(/Error Code: (\w+)/);
  if (named) {
    const entry = [...PROGRAM_ERRORS.values()].find((e) => e.name === named[1]);
    if (entry) return { name: entry.name, message: BUYER_COPY[entry.name] ?? entry.msg };
  }
  const hex = text.match(/custom program error: (0x[0-9a-f]+)/i);
  if (hex) {
    const entry = PROGRAM_ERRORS.get(parseInt(hex[1], 16));
    if (entry) return { name: entry.name, message: BUYER_COPY[entry.name] ?? entry.msg };
  }
  return null;
}

export function isWalletRejection(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return /user rejected|rejected the request|declined|cancelled|canceled/i.test(msg);
}

export function friendlyError(err: unknown, logs: string[] = []): string {
  if (isWalletRejection(err)) return "You cancelled in your wallet. Nothing was sent.";
  const msg = String((err as { message?: string })?.message ?? err);
  const prog = programErrorFrom([msg, ...logs].join("\n"));
  if (prog) return prog.message;
  if (/InvalidAccountForFee|AccountNotFound/i.test(msg))
    return "Your wallet has no SOL for network fees yet. In the demo, tap “Get $20 test USDC” — it adds a little SOL too.";
  if (/insufficient (funds|lamports)|0x1\b/i.test(msg)) return "Not enough funds (SOL for fees, or test USDC).";
  if (/blockhash not found|block height exceeded/i.test(msg)) return "The network was slow and the transaction expired. Nothing happened; try again.";
  if (/failed to fetch|network|timeout|429/i.test(msg)) return "We couldn't reach the Solana network. Check your connection and try again.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
