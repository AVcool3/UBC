/**
 * Reference-data types shared by the server adapter (app/api/reference) and the UI.
 *
 * Everything here is DISPLAY-ONLY market data from Gemini Predictions (public,
 * read-only endpoints). It comes from a different venue, on a contract whose
 * resolution terms differ from our devnet test market, so the UI never computes
 * "you save X" against it and nothing in this app can execute at it.
 */
export type ReferenceMode = "live" | "stale" | "recorded";

export interface ReferenceLevel {
  /** Dollars per $1-payout contract (= implied probability). */
  price: number;
  /** Contracts. */
  amount: number;
}

/** One outcome bucket of the Gemini event (e.g. "Hike 25bps"). */
export interface ReferenceOutcome {
  symbol: string;
  label: string;
  bestBid: number | null;
  bestAsk: number | null;
  last: number | null;
}

export interface ReferenceTrade {
  /** unix seconds */
  at: number;
  price: number;
  amount: number;
  side: "buy" | "sell" | "unknown";
}

export interface ReferenceEvent {
  ticker: string;
  title: string;
  expiry: string | null;
  termsLink: string | null;
  volume: number | null;
  outcomes: ReferenceOutcome[];
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
  /** The whole event (all outcome buckets), if the events endpoint answered. */
  event: ReferenceEvent | null;
  /** Most recent public trades on this contract. */
  trades: ReferenceTrade[];
}

/** Older than this, the UI labels the reference "stale". */
export const REFERENCE_STALE_SECS = 60;

/**
 * Walks the ask side of a book to buy `qty` contracts.
 * Returns the average price, the worst level touched, how many levels, and any
 * quantity the visible book can't fill. Pure arithmetic on the snapshot.
 */
export function walkAsks(asks: ReferenceLevel[], qty: number) {
  let left = qty;
  let cost = 0;
  let worst = 0;
  let levels = 0;
  for (const l of asks) {
    if (left <= 0) break;
    const take = Math.min(left, l.amount);
    cost += take * l.price;
    left -= take;
    worst = l.price;
    levels++;
  }
  const filled = qty - left;
  return { filled, unfilled: left, avg: filled > 0 ? cost / filled : null, worst, levels, cost };
}
