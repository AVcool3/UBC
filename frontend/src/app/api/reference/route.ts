/**
 * GET /api/reference — read-only reference quote from Gemini Predictions.
 *
 * Safety rules:
 *  - ONE hard-coded host and path (no user input reaches the URL).
 *  - Public, unauthenticated GET only; 4-second timeout; response size and
 *    schema checked before use.
 *  - Cached for 5 s across all visitors and rate-limited per client, so we stay
 *    far under Gemini's documented 120 requests/minute.
 *  - If Gemini can't be reached we return the last good quote marked "stale",
 *    or the bundled recorded snapshot marked "recorded" with its capture time.
 *    Never a silent substitute.
 */
import { NextResponse } from "next/server";
import recorded from "@/data/gemini-recorded.json";
import { REFERENCE } from "@/lib/contracts";
import type { ReferenceLevel, ReferenceQuote } from "@/lib/reference";
import { allow, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOL = REFERENCE.symbol;
const URL_ = `https://api.gemini.com/v1/book/${encodeURIComponent(SYMBOL)}?limit_bids=5&limit_asks=5`;
const CACHE_MS = 5_000;
const MAX_BYTES = 64 * 1024;

let cache: { at: number; quote: ReferenceQuote } | null = null;
let lastGood: ReferenceQuote | null = null;

/** Validates one side of the book: price in (0,1), amount > 0. Throws on anything else. */
function parseLevels(raw: unknown): { levels: ReferenceLevel[]; ts: number | null } {
  if (!Array.isArray(raw)) throw new Error("book side is not an array");
  let ts: number | null = null;
  const levels = raw.slice(0, 5).map((l) => {
    const price = Number((l as { price?: unknown }).price);
    const amount = Number((l as { amount?: unknown }).amount);
    const t = Number((l as { timestamp?: unknown }).timestamp);
    if (!(price > 0 && price < 1) || !(amount > 0)) throw new Error("bad level");
    if (Number.isFinite(t) && t > 0) ts = Math.max(ts ?? 0, t);
    return { price, amount };
  });
  return { levels, ts };
}

async function fetchLive(): Promise<ReferenceQuote> {
  const res = await fetch(URL_, { signal: AbortSignal.timeout(4_000), cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("response too large");
  const body = JSON.parse(text) as { bids?: unknown; asks?: unknown };
  const bids = parseLevels(body.bids);
  const asks = parseLevels(body.asks);
  return {
    mode: "live",
    venue: "Gemini Predictions",
    symbol: SYMBOL,
    bids: bids.levels,
    asks: asks.levels,
    sourceTimestamp: asks.ts ?? bids.ts,
    retrievedAt: Math.floor(Date.now() / 1000),
    note: "Live public order book (read-only).",
  };
}

function recordedQuote(): ReferenceQuote {
  const toLevels = (side: { price: string; amount: string }[]) => side.map((l) => ({ price: Number(l.price), amount: Number(l.amount) }));
  const at = Math.floor(Date.parse(recorded.capturedAtUtc) / 1000);
  return {
    mode: "recorded",
    venue: "Gemini Predictions",
    symbol: recorded.symbol,
    bids: toLevels(recorded.bids),
    asks: toLevels(recorded.asks),
    sourceTimestamp: at,
    retrievedAt: at,
    note: `Recorded snapshot captured ${recorded.capturedAtUtc} (live feed unreachable).`,
  };
}

export async function GET(req: Request) {
  if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.quote);
  if (!allow(`ref:${clientKey(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  let quote: ReferenceQuote;
  try {
    quote = await fetchLive();
    lastGood = quote;
  } catch (e) {
    quote = lastGood
      ? { ...lastGood, mode: "stale", note: `Last good quote; live fetch failed (${(e as Error).message}).` }
      : recordedQuote();
  }
  cache = { at: Date.now(), quote };
  return NextResponse.json(quote);
}
