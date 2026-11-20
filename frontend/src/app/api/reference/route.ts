/**
 * GET /api/reference — read-only reference data from Gemini Predictions.
 *
 * Three public, unauthenticated endpoints on ONE hard-coded host:
 *   /v1/book/<symbol>                     order book (5 levels per side)    cached 5 s
 *   /v1/trades/<symbol>                   recent public trades              cached 30 s
 *   /v1/prediction-markets/events/<tkr>   the whole event: every outcome    cached 60 s
 *
 * Safety rules: no user input reaches any URL; 4-second timeouts; response size
 * and schema checked before use; per-client rate limit; far under Gemini's
 * documented 120 req/min. If the book can't be fetched we return the last good
 * one marked "stale", or the bundled recorded snapshot marked "recorded" with
 * its capture time — never a silent substitute. Event/trades are optional extras.
 */
import { NextResponse } from "next/server";
import recorded from "@/data/gemini-recorded.json";
import { REFERENCE } from "@/lib/contracts";
import type { ReferenceEvent, ReferenceLevel, ReferenceQuote, ReferenceTrade } from "@/lib/reference";
import { allow, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = "https://api.gemini.com";
const SYMBOL = REFERENCE.symbol;
/** "GEMI-FED261211-HIKE25" → event ticker "FED261211". */
const EVENT_TICKER = SYMBOL.split("-")[1] ?? "";
const MAX_BYTES = 256 * 1024;

type Cached<T> = { at: number; value: T } | null;
let bookCache: Cached<ReferenceQuote> = null;
let lastGoodBook: ReferenceQuote | null = null;
let tradesCache: Cached<ReferenceTrade[]> = null;
let eventCache: Cached<ReferenceEvent | null> = null;

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${HOST}${path}`, { signal: AbortSignal.timeout(4_000), cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("response too large");
  return JSON.parse(text);
}

const prob = (v: unknown): number | null => {
  const n = Number(v);
  return n > 0 && n < 1 ? n : null;
};

/** Validates one side of the book: price in (0,1), amount > 0. Throws on anything else. */
function parseLevels(raw: unknown): { levels: ReferenceLevel[]; ts: number | null } {
  if (!Array.isArray(raw)) throw new Error("book side is not an array");
  let ts: number | null = null;
  const levels = raw.slice(0, 5).map((l) => {
    const price = prob((l as { price?: unknown }).price);
    const amount = Number((l as { amount?: unknown }).amount);
    const t = Number((l as { timestamp?: unknown }).timestamp);
    if (price === null || !(amount > 0)) throw new Error("bad level");
    if (Number.isFinite(t) && t > 0) ts = Math.max(ts ?? 0, t);
    return { price, amount };
  });
  return { levels, ts };
}

async function fetchBook(): Promise<ReferenceQuote> {
  const body = (await getJson(`/v1/book/${encodeURIComponent(SYMBOL)}?limit_bids=5&limit_asks=5`)) as { bids?: unknown; asks?: unknown };
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
    event: null,
    trades: [],
  };
}

async function fetchTrades(): Promise<ReferenceTrade[]> {
  const raw = await getJson(`/v1/trades/${encodeURIComponent(SYMBOL)}?limit_trades=8`);
  if (!Array.isArray(raw)) throw new Error("trades is not an array");
  return raw.slice(0, 8).flatMap((t) => {
    const price = prob((t as { price?: unknown }).price);
    const amount = Number((t as { amount?: unknown }).amount);
    const at = Number((t as { timestamp?: unknown }).timestamp);
    const type = (t as { type?: unknown }).type;
    if (price === null || !(amount > 0) || !(at > 0)) return [];
    return [{ at, price, amount, side: type === "buy" || type === "sell" ? type : "unknown" }];
  });
}

async function fetchEvent(): Promise<ReferenceEvent | null> {
  if (!/^[A-Z0-9]{3,20}$/.test(EVENT_TICKER)) return null;
  const raw = (await getJson(`/v1/prediction-markets/events/${EVENT_TICKER}`)) as Record<string, unknown>;
  const d = ((raw.data as Record<string, unknown>) ?? raw) as Record<string, unknown>;
  const contracts = Array.isArray(d.contracts) ? d.contracts : [];
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : null);
  const terms = str(d.termsLink, 400);
  return {
    ticker: EVENT_TICKER,
    title: str(d.title) ?? EVENT_TICKER,
    expiry: str(d.expiryDate, 40),
    // Only link to Gemini's own asset host.
    termsLink: terms && terms.startsWith("https://assets.gemini.com/") ? terms : null,
    volume: Number.isFinite(Number(d.volume)) ? Number(d.volume) : null,
    outcomes: contracts.slice(0, 12).map((c) => {
      const p = ((c as { prices?: Record<string, unknown> }).prices ?? {}) as Record<string, unknown>;
      return {
        symbol: str((c as { instrumentSymbol?: unknown }).instrumentSymbol, 60) ?? "",
        label: str((c as { label?: unknown }).label, 60) ?? "",
        bestBid: prob(p.bestBid),
        bestAsk: prob(p.bestAsk),
        last: prob(p.lastTradePrice),
      };
    }),
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
    event: null,
    trades: [],
  };
}

/** Returns a cached value if fresh, otherwise refreshes it; on failure keeps the old value. */
async function cached<T>(cache: Cached<T>, ttlMs: number, load: () => Promise<T>, fallback: T): Promise<{ next: Cached<T>; value: T }> {
  if (cache && Date.now() - cache.at < ttlMs) return { next: cache, value: cache.value };
  try {
    const value = await load();
    return { next: { at: Date.now(), value }, value };
  } catch {
    return { next: cache ? { at: Date.now(), value: cache.value } : { at: Date.now(), value: fallback }, value: cache?.value ?? fallback };
  }
}

export async function GET(req: Request) {
  const fresh = bookCache && Date.now() - bookCache.at < 5_000;
  if (!fresh && !allow(`ref:${clientKey(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Book (required): live → stale → recorded.
  let book: ReferenceQuote;
  if (fresh) book = bookCache!.value;
  else {
    try {
      book = await fetchBook();
      lastGoodBook = book;
    } catch (e) {
      book = lastGoodBook
        ? { ...lastGoodBook, mode: "stale", note: `Last good quote; live fetch failed (${(e as Error).message}).` }
        : recordedQuote();
    }
    bookCache = { at: Date.now(), value: book };
  }

  // Extras (optional): fetched in parallel, each with its own cache.
  const [t, ev] = await Promise.all([cached(tradesCache, 30_000, fetchTrades, []), cached(eventCache, 60_000, fetchEvent, null)]);
  tradesCache = t.next;
  eventCache = ev.next;

  return NextResponse.json({ ...book, trades: t.value, event: ev.value } satisfies ReferenceQuote);
}
