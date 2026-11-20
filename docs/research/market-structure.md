# Prediction-market structure: who signs, holds, matches, settles

Research date: **2026-11-20**. All sources were fetched on this date unless the source list gives another date. Cells are marked **O** (observed, with source tag) or **M** (missing / not verified). A **~** marks our inference.

**Legend for evidence classes**
- **Venue fact**: comes from a venue's own docs or legal filing (the source tags below).
- **Snapshot**: point-in-time public market data. Our only snapshot is Gemini `GEMI-FED261211-HIKE25` at 2026-11-20T09:10:42Z (`data/gemini-snapshot-20261120T091041Z.json`).
- **Synthetic**: anything about our Solana devnet program (test liquidity, holds, simulated failures). Nothing below is synthetic unless labelled.

## 1. Lifecycle tables

### 1a. Order-book venues

| Step | Polymarket (CLOB + CTF / V2 on Polygon) | Gemini Predictions (Gemini Titan DCM) | Kalshi (DCM) |
|---|---|---|---|
| Signing | O: user signs **EIP-712** order. "authorizes the market's settlement contract to execute the trade on your behalf without taking custody" [P1]. V2: ExchangeV3, domain version "3" [P4]. Session keys can sign for Deposit Wallets [P6] | O: API-key HMAC or OAuth on each request. The private PM payload goes in `X-GEMINI-PAYLOAD` [G7]. The user signs no order message. | O: per-request **RSA-PSS SHA-256** (or Ed25519) signature in `KALSHI-ACCESS-*` headers [K4] |
| Collateral control | O: user wallet holds **pUSD** (ERC-20, Polygon, USDC-backed, 6 dp) [P3]. Allowance goes to the settlement contract [P1] | O: exchange account (custodial). The exchange locks collateral and can "return" it on hedged No legs [G8]. M: clearing entity | O: exchange account; FCM members referenced [K-idx]. M: DCO details |
| Match authority | O: **off-chain operator** CLOB. It checks signature, balance, allowance and tick [P1] | O: Gemini order book / venue. Combo-RFQ winner is "selected" by the venue [G4] | O: exchange matching engine. Order reads update "asynchronously after the matching engine processes a write" [K-idx] |
| Cancel cutoff | O: any time before match. **Not** during the 250 ms taker delay or the sports delay. Filled portion is not cancellable. A heartbeat lapse (>10 s) auto-cancels [P1, P7] | O: Last Trading Time = Expiration Time, 2:05 PM ET (FEDDEC) [G5]. M: cancel latency or cutoff for resting orders | O: `close_time` stops new orders. Reactivation cancels resting orders [K2]. Order groups auto-cancel on a rolling 15 s limit [K-idx]. RFQ: after maker confirm, "neither party can withdraw" [K1] |
| Trade confirmation | O: `MATCHED → MINED → CONFIRMED`, or `RETRYING` / `FAILED` (terminal) [P1]. **A match can fail on-chain.** | O: `orders@account` events. "Use `Z` (not the order status) to determine how much filled" [G2]. RFQ: "Only `S: FINALIZED` confirms" [G4] | O: fills via `GET /portfolio/fills`. RFQ `quote_executed` [K1] |
| Asset settlement | O: on-chain and **atomic** on Polygon (transfer, split or merge) [P1]. V2 PositionManager from 2026-11-23 (phased) [P4] | O: book-entry positions. "Confirm settlement through the settled-positions endpoint" [G3] | O: book-entry; "Only net positions are settled" [K3] |
| Event resolution | O: **UMA Optimistic Oracle**: ~$750 bond, 2 h challenge, DVM vote if disputed twice (4–6 days). Chainlink TWAP for Up/Down [P2] | O: per-contract Source Agency (FEDDEC: Federal Reserve website). The exchange may open a Market Outcome Review under Rule 7.1 [G5] | O: `closed → determined →` (timer `settlement_timer_seconds`, may go `disputed`/`amended`) `→ finalized` [K2] |
| Redemption | O: winning token → $1 pUSD. V2 redemption goes through Router [P2, P4] | O: automatic. Settlement Date ≤ 1 day after expiration unless under review [G5] | O: automatic $1 per contract at `finalized` [K2, K3] |

### 1b. Solana implementations / integrations

| Step | DFlow: Kalshi tokenized on Solana | Jupiter Predict | Drift BET | Hedgehog Markets |
|---|---|---|---|---|
| Existence (dated) | O: launched with Kalshi, **2025-12-01** [D1]. **Caution:** DFlow's current docs index lists only spot and tokenized equities, with no prediction-market pages (2026-11-20) [D3]. Current status: **M** | O: live. Markets "mainly Polymarket" plus Jupiter integrations [J1]. Polymarket tab added Feb 2026 [S1] | O: launched **2024-08-19** [R1]. O: Velocity (a Drift v2 fork) docs say "The Drift program is paused" and `ContractType.PREDICTION` → `DEPRECATED_PREDICTION` [R2]. Treat as **not live** | O (secondary): ~$46k TVL as of 2026-11-18 [H1]. Docs host failed TLS (expired cert) on 2026-11-20 |
| Signing | O: user signs a Solana tx returned by `/order` [D2] | O: user signs a wallet tx [J1] | ~ user-signed Solana tx; M | M |
| Collateral control | O: user wallet. USDC or CASH settlement mints. **Proof KYC** is required to buy [D2] | O: user wallet, dollar-pegged assets (USDC/SOL/JupUSD input). Limit-order funds are reserved [J1] | O: Drift cross-collateral, 30+ assets [R1] | M |
| Match authority | O: "hybrid RFQ system" [D1]. Async orders are a "trade intent" that LPs fill in separate txs [D2] | O: "executes it through the market's route or integration… keepers" [J1]. M: Polymarket bridge mechanics | O: Drift DEX / liquidity pool [R1]. M: details | M |
| Cancel cutoff | M | O: limit cancel is **not possible in the first 15 s**. Costs 0.00005 SOL [J1] | M | M |
| Trade confirmation | O: `sync` → `finalized`. `async` → poll `/order-status` until `closed` [D2] | O: partial fills possible. "Execution can take time." Forecast markets have **no price protection** [J1] | M | M |
| Asset settlement | O: SPL `yesMint` / `noMint` outcome tokens [D2] | M (token form not documented to users) [J1] | ~ perp-style position, not a token; M | M |
| Event resolution | O: Kalshi determines the outcome [D2] | O: follows the source's result and "does not independently rewrite market outcomes" [J1] | M | M |
| Redemption | O: `/order` outcome-mint → USDC when the market is `determined`/`finalized` and `redemptionStatus=open` [D2] | O: Claim in Profile; some markets pay out automatically [J1] | M | M |

No Polymarket-native Solana deployment was found. The Solana access path observed is Jupiter routing to Polymarket [J1, S1]. Polymarket's own bridge supports withdrawals "to any supported chain" (docs index) [P-idx].

## 2. Closest existing equivalent to a firm or held quote

No venue lets a retail consumer **lock a price for minutes** that the counterparty cannot withdraw. The strongest real mechanisms are RFQs. In each one, the quote is held for seconds and the maker usually keeps a **last look**:

| Mechanism | What the consumer can do today | Hold / firmness | Last look |
|---|---|---|---|
| **Kalshi RFQ**, any market, REST/FIX/WS [K1] | Create an RFQ (size in contracts or `target_cost_dollars`), receive private two-sided quotes, and accept one side | The maker can replace or delete a quote until it is accepted. Then the maker must confirm within **30 s** (3 s for high-volatility markets). After confirmation, "neither party can withdraw". Orders go to the book after the **15 s** (1 s) execution timer | Yes (confirm step) |
| **Polymarket Combos RFQ** [P5] | Request a combo price. Makers quote within 400 ms. The user signs to accept within **10 s** | The quote is firm for the 10 s accept window | Optional, 1 s |
| **Polymarket RFQ Trades Partner API** [P6] | A platform submits a pre-agreed pair of signed orders. Status goes PENDING → FILLED / REJECTED on Polygon | Bilateral terms are agreed off-venue. Execution can still be REJECTED | No (both sides pre-signed) |
| **Gemini Combo RFQ** (production beta) [G4] | Request a combo quote. The sealed auction runs 1 s. Requester has **5 s** to accept | Firm for 5 s, then the maker confirms within 1 s. "A maker partial fill can remain even if the requester order fails" | Yes, 1 s |
| Resting limit order (all CLOBs) | Hit a displayed price | Not held: the maker can cancel any time before match (Polymarket [P1]). Polymarket also has a heartbeat auto-cancel [P7] | n/a; the "last look" is cancellation |
| Jupiter / DFlow quotes | See an estimated quote and set slippage | Estimate only; the order "fails or partially fills" if the price moves [J1] | Async LP fill [D2] |

**Implication for our product (our inference, not a venue fact):** a consumer can already get a **seconds-long, maker-revocable** firm quote on Kalshi (single markets) and on Polymarket/Gemini (combos only). None of these offers a pre-funded, time-boxed hold whose collateral is visible to the consumer on-chain. That gap is what our devnet "price hold" demonstrates, using **synthetic** test liquidity.

## 3. What public data cannot prove

- Public Gemini endpoints (`/v1/book`, `/v1/trades`, `prices`) are an **off-chain venue snapshot**. They cannot attest to any Solana custody or escrow. They also cannot link a Gemini match to a settlement failure in our program, or in any program: Gemini has no on-chain leg, and public trades carry no account identity [G2, snapshot].
- Polymarket is the only venue examined where an off-chain `MATCHED` trade can visibly end `FAILED` on-chain [P1]. It is the real-world analogue of "the match happened but settlement didn't". Even there, the trade-status link is only available to the authenticated owner.
- Kalshi-on-Solana (DFlow) tokens are on-chain. Resolution is still an off-chain Kalshi determination [D2].

## Sources (accessed 2026-11-20 unless dated)

- [P1] https://docs.polymarket.com/concepts/order-lifecycle.md
- [P2] https://docs.polymarket.com/concepts/resolution.md
- [P3] https://docs.polymarket.com/concepts/pusd.md
- [P4] https://docs.polymarket.com/migrate/polymarket-v2/overview.md (V2 rollout 2026-11-23 / 11-24 / 12-01)
- [P5] https://docs.polymarket.com/trading/combos/overview.md
- [P6] https://docs.polymarket.com/partners/rfq-trades.md
- [P7] https://docs.polymarket.com/trading/manage-orders.md (Order Heartbeats)
- [P-idx] https://docs.polymarket.com/llms.txt
- [G2] https://developer.gemini.com/prediction-markets/websocket/streams
- [G3] https://developer.gemini.com/prediction-markets/order-lifecycle
- [G4] https://developer.gemini.com/prediction-markets/combos-rfq/overview and `/quote-methods`
- [G5] Gemini Titan FEDDEC §40.2 filing, dated 2025-12-12: https://assets.gemini.com/predictions/terms_and_conditions/Gemini_402_Product_Filing_-_FEDDEC_-_20251211_6927e3ff-608d-4f76-98c4-f16ad6402cc6.pdf
- [G7] https://developer.gemini.com/tools
- [G8] https://developer.gemini.com/prediction-markets/collateral-return
- [K1] https://docs.kalshi.com/getting_started/rfqs.md
- [K2] https://docs.kalshi.com/getting_started/market_lifecycle.md
- [K3] https://docs.kalshi.com/getting_started/market_settlement.md
- [K4] https://docs.kalshi.com/getting_started/quick_start_authenticated_requests.md
- [K-idx] https://docs.kalshi.com/llms.txt
- [D1] https://news.kalshi.com/p/kalshi-solana-tokenized-predictions (2025-12-01)
- [D2] https://www.quicknode.com/guides/solana-development/3rd-party-integrations/kalshi-prediction-markets-with-dflow (undated; sample data Feb–Mar 2026)
- [D3] https://pond.dflow.net/llms.txt
- [J1] https://docs.jup.ag/user-docs/trade/predict/index.md, `how-it-works.md`, `settlement.md`
- [S1] https://forklog.com/en/jupiter-integrates-polymarket-joins-prediction-market-race/ (secondary; Feb 2026)
- [R1] https://www.theblock.co/post/311888/solana-based-drift-protocol-launches-prediction-market (2024-08-19)
- [R2] https://docs.velocity.exchange/developers/migrate-from-drift.md (served from docs.drift.trade/llms.txt)
- [H1] https://defillama.com/protocol/hedgehog-markets (secondary, via search summary; 2026-11-18)
