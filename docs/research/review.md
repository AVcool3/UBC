# Skeptical review: price hold vs alternatives (first pass)

Scope: RUNLOG "Frozen mechanism spec" plus web evidence. `contracts/programs/` holds only `ghost_checkout`, so on-chain claims below concern the spec, not tested code.

## Five blunt findings

1. **Latency is not the problem a hold solves.** On Solana, `buy_now(qty, max_price)` already gives "this price or nothing", settled in about one slot. No price-uncertainty window exists for a hold to cover. A hold is undominated only when the buyer wants **minutes to think**, which makes it an ATM American call on a binary share, not an execution or UX fix.
2. **The economics have no sweet spot.** The value of an ATM call is about 0.4·σ·√T. Quiet market: σ≈0, the hold is worthless, just come back later. Live market (in-play sports, data releases): one event moves YES 10–30¢, so a fee covering that jump risk is several percent of notional. The fee is cheap only where the hold is useless.
3. **Adverse selection is structural, not a tail risk.** Buyers exercise only when ask_now > held price. Our display-only Gemini reference tells them when; the maker cannot hedge (no Gemini execution). The fee, `ceil(hold_rate·qty·secs/60)`, is linear in T, ignores σ, ignores p (|Δp| is largest near 0.5) and ignores time-to-event. Mispriced by design.
4. **Inventory griefing is priced only by that same flat fee.** One wallet can `hold` all of `available` for `max_hold_secs` and lock the pool. Cost: the fee. No per-buyer cap in the spec.
5. **What the chain enforces is real, but over a toy asset.** The spec does enforce more than a hash. Shares move `available→reserved` inside a PDA vault the maker cannot touch, the price is frozen in the Hold PDA, `exercise` is an atomic DvP that only the beneficiary can call before `expires_at`, and `release` is permissionless at or after expiry. Real custody plus deadline enforcement, but over a test YES token from our own admin-resolved market, with nothing tying it to the Gemini market the user sees. The on-chain contribution is "covered call escrow with permissionless expiry", and Solana options protocols already did that: PsyOptions issued fully collateralized American options as SPL tokens in 2021–22.

## Prior art (novelty check)

| Existing | What it does | Bearing |
|---|---|---|
| Hopper Price Freeze | Non-refundable fee locks a fare for days; credited on booking; capped coverage. | Exact consumer analogue; works because flights need **days** of coordination. FTC settlement (reported $35M) partly over Price Freeze marketing: fee disclosure is a legal hazard. |
| Jupiter Z (RFQ v2) | Firm quotes with no slippage range, `QUOTE_EXPIRED` after expiry, and the **maker co-signs each fill (last look)**. | C1 and C4 already exist on Solana at scale. |
| Polymarket combos RFQ | 400 ms quote window, then a 10 s user acceptance window, and Last Look enabled. | It is literally C1 plus C4 in a prediction market. |
| Kalshi RFQ | Private maker quotes for combos. | RFQ for prediction markets is standard. |
| Hashflow (incl. Solana) | Maker-signed quotes verified on-chain. Expired or invalid signatures revert. | C1 without last look already exists. |
| PsyOptions | Collateralized American calls as SPL tokens on Solana. | C3's on-chain mechanism is a covered call. |

**Novelty verdict:** unsubstantiated for all four *as mechanisms*. Only the **framing** is defensible: a disclosed consumer choice between "buy now" and "rent a guarantee" on prediction-market shares, with a permanent receipt. UX, not mechanism.

## Per-concept verdicts

Scores run 0–5 on: **D**ecision improved, **Diff**erentiation, **V**erifiable on-chain contribution, **E**conomics measurable, **F**easible demo.

### C1. Binding short-lived firm quote (maker-signed)
- **Falsifiable objection:** Show a Jupiter Z or Hashflow fill on Solana where a maker-signed quote settled atomically before expiry. If one exists, and it does per their docs, C1 is a re-implementation.
- **Cheapest baseline:** `buy_now` with `max_price` against an on-chain ask.
- **Scores:** D 1. The guarantee duplicates max-price. Diff 0. Jupiter Z, Hashflow and Polymarket RFQ already do this. V 3. The ed25519 signature check and expiry are real. E 2. You can measure fill rate and quote fade, but with one maker there is nothing to compare. F 4. It is simple.
- **Verdict: FAIL.** One ordinary counterexample (Hashflow/Jupiter Z) kills the novelty, and `buy_now` kills the consumer benefit.

### C2. Receipt-only (better pending/confirmed/finalized labels)
- **Falsifiable objection:** Time `buy_now` on devnet. If p95 from submit to `confirmed` is under ~2 s, the "pending" state a better label would explain barely exists. The tx signature plus Explorer is already a verifiable receipt.
- **Cheapest baseline:** Phantom's or Solflare's existing toast with an Explorer link.
- **Does a better label alone deliver the same benefit as a hold?** For *execution uncertainty*, yes, completely, because atomic `buy_now` leaves no price risk to explain. For *deliberation time*, no. So C2 makes C3's "clarity" claim redundant; C3 must stand on deliberation alone.
- **Scores:** D 2. It is honest but trivial. Diff 0. V 1. It re-displays data the chain already records. E 1. There is nothing economic to measure. F 5.
- **Verdict: FAIL as a product, KEEP as a component.** Use it as C3's default labelling.

### C3. Informed choice: atomic buy vs priced hold (favourite)
- **Falsifiable objection (the kill test):** Pull public Gemini Predictions price history, which the team is allowed to read. For each market and each T in {60, 300, 900} s, compute the breakeven fee E[max(P_T − P_0, 0)] per share. Then compare it with what consumers will plausibly pay. Anchor: **≤1% of notional**. The core claim dies if no (market type, T) cell has a breakeven fee that is both ≥0.2¢ (otherwise nobody needs the hold) and ≤1% of price (otherwise nobody buys it). Second counterexample: after a hold, the user can watch the Gemini reference and exercise only on up-moves. A replay showing negative maker P&L at the spec's flat `hold_rate` proves the fee is mispriced.
- **Cheapest baseline:** "Do nothing and come back later at the then-current ask". The second baseline is "buy now and sell back at the bid if you regret it", which costs the round-trip spread. By put-call parity, a hold = buy now + a put, so the fee must beat spread × P(regret) + the put value. The team has measured neither.
- **Who pays for held inventory?** The maker bears the opportunity cost of `reserved` stock and the short-call payoff. The only compensation is a flat fee that ignores σ, p and time-to-event. Uninformed holders pay the maker; informed holders take from the maker: ordinary adverse selection, worsened by our UI showing a faster reference price.
- **What is enforced:** custody, the frozen price, the deadline and permissionless release. Those claims are true and verifiable. "The chain enforces your Gemini price" is false.
- **Scores:** D 3. A disclosed choice with a printed fee is a real improvement over hidden last-look RFQ, but only for deliberating buyers. Diff 2. Hopper is the consumer analogue and PsyOptions the mechanism; the new part is the framing for prediction markets. V 4. The escrowed reserve, atomic exercise, permissionless release and permanent Hold PDA receipt are all inspectable. E 3. It is measurable with the replay above, and that is the strongest asset if the team runs it. F 3. The program is unwritten; 5 instructions, tests, UI and the replay in about 6 h is tight.
- **Verdict: CONDITIONAL PASS.** It passes only if the claim is narrowed (below) and the econ replay is shown. As currently phrased ("freeze the market price", implying Gemini), it **FAILS**: we have no venue, and `buy_now` dominates on any short horizon.

### C4. Disclosed time-limited maker decline (last look)
- **Falsifiable objection:** Polymarket RFQ and Jupiter Z already ship last look with documented windows,; FX codified disclosed last look (Global FX Code, Principle 17). Disclosure leaves the maker's free option intact. Measure the reject rate conditional on adverse price moves.
- **Cheapest baseline:** `buy_now` (no last look at all), which dominates C4 for the consumer outright.
- **Scores:** D 0. It makes the consumer strictly worse off than an atomic buy. Diff 0. V 2. A decline deadline is enforceable but trivial. E 2. F 4.
- **Verdict: FAIL.** Consumer-hostile prior art. Fine as a contrast slide ("what we refuse to do").

## Required narrowing for C3 to survive
Replace "we freeze market prices on-chain" with:

> "On Solana, a buyer of a fully collateralized prediction-market share chooses between an atomic max-price buy and a **disclosed, fee-priced, maker-escrowed call option** that expires deterministically. The program guarantees reserved inventory, the frozen price, atomic exercise and permissionless release. The fee is shown next to its estimated option value, backtested on public Gemini price history. Gemini prices are reference only; settlement is test assets."

Also: (a) price the fee as `k·σ̂·√T`, or show flat `hold_rate` losing in the replay; (b) cap holds per buyer; (c) never put "Gemini" next to "held price" in the UI.

## Sources
- [Hopper Price Freeze (Thrifty Traveler)](https://thriftytraveler.com/hopper-launches-price-freeze-feature/), [Hopper help: redeeming a freeze](https://help.hopper.com/en_us/price-freeze-for-flights-how-to-redeem-your-price-freeze-ry2fKOtv), [FTC/Hopper settlement coverage](https://www.insideprivacy.com/united-states/federal-trade-commission/ftc-settles-with-hopper-over-hidden-fee-practices/), [class action on the cap](https://classaction.org/news/hoppers-price-freeze-tool-comes-with-a-hidden-catch-class-action-claims)
- [Jupiter Z v2 overview](https://jupiterz.jup.ag/docs/v2/overview), [Jupiter Z FAQ](https://jupiterz.jup.ag/docs/faq)
- [Polymarket RFQ overview](https://docs.polymarket.com/market-makers/rfq/overview), [Polymarket last-look endpoint](https://docs.polymarket.com/api-reference/maker/confirm-or-decline-last-look.md), [Polymarket combos requesters](https://docs.polymarket.com/trading/combos/requesters)
- [Kalshi RFQs](https://docs.kalshi.com/getting_started/rfqs), [Oddpool: Kalshi RFQ makers](https://www.oddpool.com/research/kalshi-rfq-market-makers)
- [Hashflow 2.0 with Solana (The Defiant)](https://thedefiant.io/hashflow-launches-2-0-iteration-featuring-solana-support-and-dex-aggregation)
- [PsyOptions (Moralis wiki)](https://developers.moralis.com/web3-wiki/psyoptions)
- [Gemini prediction markets API](https://developer.gemini.com/prediction-markets/market-data)
