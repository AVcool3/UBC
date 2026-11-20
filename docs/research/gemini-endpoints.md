# Gemini Predictions: public read-only endpoints (reference adapter)

Retrieved 2026-11-20 (UTC). Analyst: market-structure research.

**How this was obtained.** No "Gemini prediction markets tool" was installed in this session, so this file relies only on the **public, unauthenticated REST endpoints** described in Gemini's developer docs. I fetched them with curl. I did not use an account, API key, or OAuth, and I did not accept terms, place orders, or call any authenticated endpoint.

**Exchange connector or research assistant?** Gemini offers an **exchange connector**. Its open-source MCP server and agent skills (https://developer.gemini.com/tools, checked 2026-11-20) provide "public market-data tools and authenticated tools for orders, funds, accounts, margin, and staking". There is also a TypeScript SDK, `@gemini-markets/sdk`. Gemini does not ship a research assistant. For our product, only the public market-data subset is relevant, and we use it for **display only**.

Venue: Gemini Titan, LLC, a CFTC Designated Contract Market (DCM). It self-certifies contracts under 17 CFR 40.2, per the FEDDEC filing PDF below. Production base URL: `https://api.gemini.com`. Sandbox base URL: `https://api.sandbox.gemini.com`.

Public rate limit (https://developer.gemini.com/rate-limit): **120 req/min, with a recommended limit of 1 req/s**. Requests over the limit get HTTP 429. The adapter should poll at most once every 2–5 s and cache the results.

---

## 1. Documented public endpoints

Spec: https://developer.gemini.com/prediction-markets-spec (the "Markets", "Volume" and "Combos" tags are described as public). The spec's own wording: "Only fields documented in this specification are considered stable."

### 1a. Discovery / contract terms (Prediction Markets namespace)

| Purpose | Method + URL | Notes |
|---|---|---|
| List events (paginated) | `GET https://api.gemini.com/v1/prediction-markets/events` | query params: `status` (approved, active, closed, under_review, settled, invalid; repeatable), `category` (repeatable), `search`, `limit` (1–500, default 50), `offset`, and sports filters. Each event embeds `contracts[]` with `prices`. |
| Event by ticker | `GET https://api.gemini.com/v1/prediction-markets/events/{eventTicker}` | Full event with contracts, rules text, `termsAndConditionsUrl`, and tick/size metadata. The spec documents a `contractOrderbooks` field, but **live responses for FED261211, SAVEACT and RECESSION26 did not include it** (observed 2026-11-20). |
| Strike (crypto Up/Down, sports lines) | `GET https://api.gemini.com/v1/prediction-markets/events/{eventTicker}/strike` | `{value, type, availableAt}` |
| Newly listed / upcoming / recently settled | `GET .../v1/prediction-markets/events/newly-listed`, `.../events/upcoming`, `.../events/recently-settled` | Same `EventsResponse` shape |
| Categories | `GET https://api.gemini.com/v1/prediction-markets/categories` | `{"categories":["Live","Sports",...,"Economics","Politics",...]}` |
| Volume | `GET .../v1/prediction-markets/volume/{date}` and `.../volume/{date}/hourly` | Aggregate by category and UTC period |
| Combos | `GET .../v1/prediction-markets/combos` and `.../combos/{instrumentSymbol}` | Multi-leg contracts |

### 1b. Quotes / depth / trades (core Gemini market-data endpoints; they accept `GEMI-` symbols)

The Prediction Markets docs say the venue "uses the core book, depth, trade ... stream protocol". In a single read-only GET each, the core public REST endpoints below **returned valid data for a `GEMI-...` symbol** (observed 2026-11-20). They are part of the documented core market-data API, but the prediction-markets spec page does not list them by name. Treat them as "documented core endpoints that work for prediction symbols, but are not promised by the PM spec".

| Purpose | URL | Timestamp fields |
|---|---|---|
| **Order book / depth** | `GET https://api.gemini.com/v1/book/{symbol}?limit_bids=N&limit_asks=N` | per-level `timestamp` = **epoch seconds as a string**. All levels carry the same value, equal to server time at the response (2026-11-20T09:10:42Z). It is a snapshot time, **not a per-level update time**. |
| Top of book + last | `GET https://api.gemini.com/v1/pubticker/{symbol}` | `volume.timestamp` = epoch **milliseconds**, rounded to the minute |
| Ticker v2 | `GET https://api.gemini.com/v2/ticker/{symbol}` | no timestamp. Hourly `changes[]` (24 entries) |
| Trades | `GET https://api.gemini.com/v1/trades/{symbol}?limit_trades=N` | `timestamp` (s), `timestampms` (ms), `tid`, `type` = taker side |
| Symbol details | `GET https://api.gemini.com/v1/symbols/details/{symbol}` | `tick_size` 0.01, `min_order_size` "0.01", `status` "limit_only", `quote_currency` "USD" |

Note: `GET /v1/symbols` does **not** list `GEMI-` symbols (349 symbols, none GEMI; observed 2026-11-20). Discover them only through `/v1/prediction-markets/events`.

### 1c. Streaming (documented, public; not used in this snapshot)

`wss://ws.gemini.com`, from https://developer.gemini.com/prediction-markets/websocket/streams:

- `{symbol}@bookTicker`: real-time best bid/ask. Fields `b`/`B`/`a`/`A`, and `E` = event time in **nanoseconds**.
- `{symbol}@depth5|10|20[@100ms]`: periodic top-N snapshots `[price, qty]`.
- `{symbol}@depth[@100ms]`: diffs, with `?snapshot=-1` for an initial book.
- `{symbol}@trade`, `contractStatus`, and `{agency}:{index}@indexPrice` (e.g. `lukka:LS-LRRR-XBTUSD@indexPrice`).

This is the only source with true per-update event timestamps. Doc quote: "Public depth for event contracts is normalized in YES space: for YES notional, compute yesPrice * quantity; for NO notional, compute (1 - yesPrice) * quantity."

---

## 2. Units, symbols, timestamps

- **Price unit: USD per contract, as a decimal string between 0.01 and 0.99**, e.g. `"0.89"`. One contract pays **$1.00** if YES (FEDDEC filing §(d)(1): "notional size of one dollar ($1.00)"). So price = USD = implied probability. It is **not in cents**. Tick is `priceIncrement` "0.01"; `priceMinimum` is "0.01". The filing §(g) says no orders below $0.01 or above $0.99. `pubticker` returns 4 dp (`"0.8900"`), while book, trades and events return 2 dp. Parse all of them as decimals, not floats, if you do any arithmetic.
- **Quantity unit: contracts**, as decimal strings. Fractional amounts down to `quantityIncrement` "0.01" are allowed (e.g. `"116.27"`).
- **Book side convention:** the `/v1/book` bids and asks are **YES-side** prices. NO prices are derived. In `prices` on the event endpoint, `buy.no` = 1 − `bestBid` and `sell.no` = 1 − `bestAsk` (observed: bestBid 0.89 → buy.no 0.11).
- **`prices` object** (events endpoint): `{buy:{yes,no}, sell:{yes,no}, bestBid, bestAsk, lastTradePrice}`. **It has no timestamp.** `bestBid` is omitted when the bid side is empty (observed for CUT25 and RECESSION26).
- **Symbol format:** `GEMI-{EVENT_TICKER}-{CONTRACT_TICKER}`. Examples: `GEMI-FED261211-HIKE25`, `GEMI-SAVEACT-YES`, `GEMI-BTC15M2611200915-UP`, and sports `GEMI-NBA-2611220030-POR-NYK-…`. Event tickers encode dates as YYMMDD[HHMM].
- **Event `type`:** `binary` (one contract) or `categorical` (several mutually exclusive contracts, each traded as its own YES/NO binary).
- **Timestamps:** ISO-8601 UTC strings with ms (`"2026-12-11T05:00:00.000Z"`) in `createdAt`, `effectiveDate`, `expiryDate`, `resolvedAt`, and `strike.availableAt`. Epoch seconds and milliseconds appear in the core REST endpoints. Epoch nanoseconds appear in the WebSocket `E` field.
- **Resolution fields:** `status`, `resolutionSide` ("yes"/"no"), `resolvedAt`, `settlement.value`, and `sourceDetails{agency,index}` for crypto/commodity index events. Rules text is in `contracts[].description` (rich-text doc), with a legal PDF at `termsAndConditionsUrl`.

---

## 3. Snapshot (one discovery call + one quote/depth call, plus supporting calls)

File: [`data/gemini-snapshot-20261120T091041Z.json`](data/gemini-snapshot-20261120T091041Z.json). Header: `{retrieved_at_utc, url, note}`. Arrays are trimmed and image URLs removed. Calls, in order, 2026-11-20T09:10:41–43Z:

1. Discovery: `GET /v1/prediction-markets/events?status=active&category=Economics&limit=20` (9 events)
2. Terms: `GET /v1/prediction-markets/events/FED261211`
3. Depth: `GET /v1/book/GEMI-FED261211-HIKE25?limit_bids=10&limit_asks=10`
4. `GET /v1/pubticker/GEMI-FED261211-HIKE25` and `GET /v1/trades/GEMI-FED261211-HIKE25?limit_trades=10`

Trimmed discovery response (shape):

```json
{"data":[{"id":"301111","ticker":"FED261211","title":"Fed decision in December?","type":"categorical",
  "category":"Economics","status":"active","expiryDate":"2026-12-11T05:00:00.000Z","volume":"14638.37",
  "contracts":[{"id":"301111-735865","label":"Hike 25bps","ticker":"HIKE25",
    "instrumentSymbol":"GEMI-FED261211-HIKE25","marketState":"open",
    "prices":{"buy":{"yes":"0.93","no":"0.11"},"sell":{"yes":"0.89","no":"0.07"},
              "bestBid":"0.89","bestAsk":"0.93","lastTradePrice":"0.93"},
    "priceIncrement":"0.01","quantityIncrement":"0.01","quoteAssetPrecision":2}]}],
 "pagination":{"limit":20,"offset":0,"total":9}}
```

Book response (verbatim, from the snapshot):

```json
{"bids":[{"price":"0.89","amount":"449.0","timestamp":"1795165842"},
         {"price":"0.86","amount":"116.27","timestamp":"1795165842"},
         {"price":"0.83","amount":"361.44","timestamp":"1795165842"}, "...3 more"],
 "asks":[{"price":"0.93","amount":"25.0","timestamp":"1795165842"},
         {"price":"0.94","amount":"6666.0","timestamp":"1795165842"},
         {"price":"0.95","amount":"120.0","timestamp":"1795165842"}]}
```

### Selected contract: `GEMI-FED261211-HIKE25` (snapshot facts, as of 2026-11-20T09:10:42Z)

| Field | Value |
|---|---|
| Symbol | `GEMI-FED261211-HIKE25` (event `FED261211`, contract `HIKE25`) |
| Question | "Fed decision in December?", outcome "Hike 25bps" |
| Rules (API text) | "If the Federal Reserve increases rates by 25bps on December 9, 2026, then the market resolves to Yes. Otherwise, it resolves to No. Outcome verified from the Federal Reserve. This market is mutually exclusive… If the scheduled December 8–9 FOMC meeting is canceled… 'Fed maintains rate' will resolve to Yes and all others will resolve to No." |
| Resolution source | Federal Reserve. The FEDDEC §40.2 filing (Gemini Titan, dated 2025-12-12) names the "Source Agency" as the official website of the Federal Reserve System. Settlement Date is no later than the day after the Expiration Date, unless under review (Rule 7.1). Expiration Time is 2:05 PM ET. |
| Terms PDF | https://assets.gemini.com/predictions/terms_and_conditions/Gemini_402_Product_Filing_-_FEDDEC_-_20251211_6927e3ff-608d-4f76-98c4-f16ad6402cc6.pdf (a generic FEDDEC template filed in Dec 2025 and reused for the Dec 2026 meeting) |
| Expiry (API `expiryDate`) | `2026-12-11T05:00:00.000Z`. **Caveat:** the PDF says expiry is the first 2:05 PM ET after the decision (i.e. Dec 9, 2026). Treat the API `expiryDate` as an upper bound for display, and the FOMC decision (2026-12-09) as the effective event time. |
| `marketState` / `status` | `open` / `active` |
| Best bid | **0.89 × 449.0** contracts |
| Best ask | **0.93 × 25.0** contracts (spread 0.04) |
| Depth (top 10 returned) | bids 6 levels, 1,705.18 contracts total (0.89→0.75). Asks 3 levels, 6,811 contracts total (0.93, 0.94×6666, 0.95) |
| Source timestamp | book `timestamp` 1795165842 = **2026-11-20T09:10:42Z** (server snapshot time). Local request time 2026-11-20T09:10:42.619Z |
| Last trade | 0.93 × 1 at 2026-11-16T22:26:12Z (`/v1/trades`). `pubticker` 24h volume = 0 |

**Why this contract:** its terms are unambiguous (one official Fed decision), it stays open for ~3 weeks so it is stable for a demo, it has a two-sided book with a mid-range price (good for showing a price hold), and its tick and size metadata are clean. **Liquidity is modest:** the top-of-book ask is only 25 contracts, and the last trade was ~3.5 days earlier. Fallbacks:
- Higher activity but shorter-lived: sports moneylines such as `NCAAM-2611201730-MINN-OKST-M` (volume $1.2k).
- The single-contract `binary` events `GEMI-SAVEACT-YES` and `GEMI-RECESSION26-2026`: clear terms, but priced at 0.01–0.04, which is poor for a demo.
- Avoid the 5- and 15-minute crypto Up/Down series (`BTC05M…`, `BTC15M…`). They expire within minutes.

---

## 4. Recommendation for the read-only reference adapter

1. **Terms / status:** `GET /v1/prediction-markets/events/FED261211`. Use the contract where `instrumentSymbol == "GEMI-FED261211-HIKE25"` and read `label`, `description`, `termsAndConditionsUrl`, `expiryDate`, `marketState`, `status`, `resolutionSide`, `resolvedAt`, and `prices`.
2. **Reference quote with timestamp:** `GET /v1/book/GEMI-FED261211-HIKE25?limit_bids=5&limit_asks=5`. Use `bids[0]`, `asks[0]`, and level `timestamp` (epoch s) as `source_ts`. As a fallback, use `/v1/pubticker/{symbol}` (no book timestamp) or the event `prices` (no timestamp).
3. Units: parse price strings as USD per $1 contract (0.01–0.99) and quantities as contracts. Convert to cents or bps only at the UI layer. Label the value "Gemini reference (display only, not executable)". Show `source_ts` and age. Treat it as stale after ~30 s.
4. Optional: for live updates, use WebSocket `GEMI-FED261211-HIKE25@bookTicker` on `wss://ws.gemini.com` (public; `E` is in ns).

**What the public data cannot do:** it cannot attest to any Solana custody or settlement. It also cannot link a Gemini off-chain match to a fill or failure in our program. Gemini prices are a snapshot reference only. Executable prices come from our devnet program's own test liquidity.
