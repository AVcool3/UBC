/**
 * Reference-price types shared by the server adapter (app/api/reference) and the UI.
 *
 * A reference quote is DISPLAY-ONLY. It comes from a different venue (Gemini
 * Predictions), on a contract whose resolution terms differ from our devnet test
 * market, so the UI never computes "you save X" against it and nothing in this
 * app can execute at it.
 */
export type ReferenceMode = "live" | "stale" | "recorded";

export interface ReferenceLevel {
  /** Dollars per $1-payout contract (= implied probability). */
  price: number;
  /** Contracts. */
  amount: number;
}

export interface ReferenceQuote {
  mode: ReferenceMode;
  venue: "Gemini Predictions";
  symbol: string;
  bids: ReferenceLevel[];
  asks: ReferenceLevel[];
  /** When the venue says the book was snapshotted (unix seconds), if it says. */
  sourceTimestamp: number | null;
  /** When our server fetched it (unix seconds). */
  retrievedAt: number;
  /** Human note shown next to the price (e.g. why it's recorded). */
  note: string;
}

/** Older than this, the UI labels the reference "stale". */
export const REFERENCE_STALE_SECS = 60;
