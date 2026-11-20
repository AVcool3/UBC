# Economist notes: displayed prices that fail to fill, and what a price hold changes

Scope: what the literature says about displayed fills that fail to settle ("ghost fills"), and what that means for our hold-then-exercise product. Read 2026-11-20.

**Source status**
- **[C] Chen, Long & Su**, "Ghost-Filled Orders", arXiv:2609.17902v1 (HTML read in full).
- **[S] Shen, Jin, Wu, Wang & Chen**, "The Ghosts of Polymarket", arXiv:2606.16852. The HTML now serves **v2 (10 Oct 2026)**. I also read v1 (`/html/2606.16852v1`). All [S] figures below are from v2 unless marked.
- **Abstract only:** [D] Dubach, arXiv:2604.24366v2; [CJW] Cartea, Jaimungal & Walton, *Math. Financ. Econ.* (2019), arXiv:1806.04460; [O] Oomen, "Last look", *Quant. Finance* 17(7):1057–1070 (2017).
- **"Qin and Yang"**: no paper by these two authors found. [C] cites Qin, Zhou & Gervais (arXiv:2101.05511); [S] cites Yang et al. 2024, "SoK: MEV Countermeasures" (arXiv:2212.05111). The closest failed-transaction study is Gogol, Schneider & Tessone (arXiv:2506.01462). Abstracts only.
- **The reading list ("Prediction Market Microstructure & Integrity Research Reading List.docx") was not available.** Everything here comes from the papers and their citations.

**Replication data**
- **[S]:** github.com/shenyimings/ghost-hunter (MIT, "academic research only"). It has the code plus BigQuery and Dune SQL. Its README says raw outputs and attacker lists are deliberately left out, so you regenerate the data from `bigquery-public-data.crypto_polygon`.
- **[D]:** github.com/philippdubach/polymarket-microstructure, Zenodo 10.5281/zenodo.19811426.
- **[C]:** no data or code release is mentioned.

## A. Claims ledger

Notation: "tx" means a reverted settlement transaction. "PM" means Polymarket on Polygon.

| # | Claim | Source | Unit | Population / window | Identification | Limitation | Implication for us |
|---|---|---|---|---|---|---|---|
| 1 | 2,037,304 reverted matchOrders; 261,156 distinct participants | [S] §5.1 | tx; addresses | PM V1+V2 exchanges, 2025-08-15 to 2026-08-15 | Failed receipts in BigQuery | Counts attackers and victims together, not harmed users | Failed settlement is large on hybrid venues |
| 2 | Worst day: 8.5% of matchOrders reverted. Worst hour: 23,596 of 97,048 (24.3%), 2026-05-04 11:00–12:00 UTC. After Deposit Wallets: ~8% fell to 0.3% within two days, then averaged 0.04% (max 0.25%) | [S] §5.1 | share of txs (denominator observed) | Same | Revert count over all matchOrders | Per tx, not per order or user | The rate collapsed once user-side control was removed, not when the display changed |
| 3 | V1: 1,090,017 over ~9 months. V2: 947,287, of which 862,423 came in V2's first week. Insufficient balance is 52.5% of reverts; ERC-1155 callback is 39.5% | [S] Table 1 | tx | V1 vs V2 | Revert reason mapped to source site | Different clocks and regimes | Closing one vector (nonce) moved the attack to another |
| 4 | 994,196 (48.8%) attributed to Cancellation Attacks. Sample validation found 0 misclassified out of 1,527 | [S] §6, §6.1 | tx | Same | A participant action after signing explains the revert. Rules were built by snowball sampling | No ground truth; the other 51.2% is not shown benign (incl. 21,076 fee-bug reverts, §6.5) | About half of failures are strategic |
| 5 | Attack reverts reduce to 539,843 unique signed orders, with $141.3M notional. Had they settled, owners would have lost **$103.7M net** (73 cents per dollar of notional) | [S] §8.1 | unique order; USD at resolution | Attack subset, full window | Buy loss = c − qx (cost minus payout); sell loss = qx − c | Hindsight valuation | Taking out the free option is worth roughly this much to counterparties |
| 6 | $1.83B of collateral "failed to settle" (median revert $11, p90 $505); $1.46B for attacks | [S] §5.4, §6 | tx-level sum | Same | Collateral leg in calldata | Counts repeated matches again ($1.46B vs $141.3M unique) | **Do not cite as harm** |
| 7 | Operator gas: 2.36M POL (~$177K) in total; attacks account for 2.17M POL (~$162K, 92%) | [S] §5.4, §6 | POL; USD at $0.075 (2026-08-15) | Same | Receipts | End-of-window price | The operator pays for failures |
| 8 | 47,441 attacker addresses, 65.3% of them seen in only one revert. One funder created 24,539 wallets in 5 days | [S] §8.2 | address | Same | Funding graph | Links incomplete | Bans fail; price the option instead |
| 9 | **Version conflict.** v1 says "$1.49M realized profit" in the abstract and §VIII-A, but "$2.95M" in the conclusion; "980,133 filled orders"; gas "$212K". v2 removes the profit figures and reports reverts, unique orders and $162K | [S] v1 vs v2 | – | v1 ends 2026-05-06 | – | v1 contradicts itself | **Use v2.** [C] §VII's "realized profits" describes v1 |
| 10 | 1,824,926 reverted txs. 50,271 (2.8%) are operator-side. Invalidating tx found for 1,714,077 (96.6% of user-controlled reverts). Average invalidation cost: $0.0174 | [C] Table II | tx | PM, 2025-08-12 to 2026-05-22 | Replay the tx, then backtrack the last state flip | Bounded search (47,026 ERC-1155 misses) | Cancelling costs ~2 cents, so the option was nearly free |
| 11 | Avoided loss **61,279,487** vs forgone gain 380,422 (161:1); 94% of reverts avoided a loss. Before end: maker 85%, taker 81%. After end: 99% / 98% | [C] Table III, §V-D | tx; USD (the text says "over 61M USD") | 757,580 reverts whose invalidating tx came ≤60 s before market end or after it | Accidental reverts should be roughly symmetric between loss and gain | Selected on timing; hindsight; no order dedup stated; gross | Informed option exercise. Not comparable with row 5 (unit, window, filter, gross vs net), so no real conflict |
| 12 | 64,604 revert clusters (≥5 reverts per block, gaps ≤2 blocks) across 30,406 markets. In 49,567 (77%), one address caused ≥90% of reverts. Of the 10,017 clusters with trades in all three windows: 3,265 price spikes, 3,133 dips, 3,619 smooth | [C] §V-E | cluster | Same | Price before / during / after | Text's "63.88% of the revert clusters" is out of 10,017, not 64,604 (I get 6,398/10,017 = 63.87%) | Failures move prices for third parties (replacement cost) |
| 13 | "Market X" adds an **up-to-10 s delay** between fill and settlement and blocks API cancellation during it. Users still control their on-chain assets, so the delay is exploitable and profitable. The three audited venues have $61.98M combined 7-day volume | [C] §VI-B, Table IV | venue | 3 unnamed venues | Active PoC | n=3; names withheld | **Closest analogue to our hold**: a delay without escrow is a free option |
| 14 | Unrelated orders in the same settlement batch were "not reliably returned to the order book" | [C] §VI-B, Property 1 | – | Audit tests | PoC | Not quantified | Never bundle buyers' exercises in one tx |
| 15 | Last look narrows quoted spreads with one venue. With two venues, the last-look venue may quote wider spreads. Model assumes zero-profit, risk-neutral brokers | [CJW] abstract | theory | FX spot | Model | Maker-side option | Options get priced into spreads; ours is the taker-side mirror |
| 16 | The design of last look and the trading protocol determine execution risk. Effective transaction costs "may be unaffected". When the trader adversely selects the liquidity provider, design differences largely disappear | [O] abstract | theory | OTC FX | Model | Abstract only | A hold moves execution risk; don't sell it as cheaper |
| 17 | Trade direction inferred from the public feed matches on-chain truth on only ~59% of buckets (panel mean 0.615, 95% CI [0.58, 0.65]). Archive-ingestion delay: median under 50 ms, with a multi-second tail | [D] abstract | bucket | 600-market panel; 30 billion events over 52 days | Join to on-chain OrderFilled | Abstract only | The feed is not settlement truth; the UI should read program state |
| 18 | >80% of rollup reverts are swaps, and about half target USDC-WETH. Qin et al.: BEV of 540.54M USD over 32 months | 2506.01462 abstract; 2101.05511 abstract | tx; USD | L2s; Ethereum | Traces | Abstracts only | Raw reverts are mostly bot spam, not consumer harm |

## B. Definitions to keep distinct

- **Reverted transaction:** one failed on-chain settlement; the unit of [C] Tables II–III and [S] Table 1. A tx bundles several orders ([C] Def. 3); one failing leg fails all.
- **Unique affected order:** a distinct signed order. Only [S] §8.1 deduplicates (994,196 attack reverts to 539,843 orders, ~1.84 per order, my arithmetic). Neither paper counts innocent orders bundled into a revert.
- **User never eventually filled:** not measured by either paper; needs post-revert order lifecycle and later fills. **Denominator not observed.**
- **Avoided loss:** the *cancelling* owner's counterfactual loss at resolution. [C]: gross, per tx. [S]: net, per unique order.
- **Realized profit:** actual address P&L. [S] v1 gave $1.49M (Polymarket data API); v2 §9 drops it (profits land on unlinkable companion addresses). [C] does not measure it.
- **Forgone gain:** what the canceller gave up on a would-be winner ([C] only). In a binary match before fees, one side's avoided loss is the counterparty's forgone gain at resolution (my inference).
- **Replacement cost:** what the *non-cancelling* party pays to rebuild the position at post-failure prices (price move + spread + fees). **Unmeasured by both**; [C] §V-E spikes/dips and [S] P2 (bot forced to dump; counterparty wallet redeemed $4,415.37) are partial evidence. This, not a hindsight resolution value, is the consumer-relevant harm.

## C. Notes

- **Retries.** Failed trades are marked RETRYING or FAILED and dropped ([C] §III); "the same order can be matched and reverted many times" ([S] §8.1). How many retries eventually filled: **denominator not observed**. Tx-level dollar sums (row 6) are inflated by repeats.
- **Batch legs.** One invalidated leg reverts the whole bundle ([C] Property 1); [S]'s `need(c,k)` sums an owner's obligation across legs; NegRisk settlements run out of gas as makers grow ([S] §6.5). Harmed third-party orders per revert: not reported.
- **Changed exposure.** Parties who hedge or re-quote on a reported fill carry the exposure ([S] §1, App. D); revert clusters move prices ([C] §V-E). Not measured in dollars.
- **Outcome hindsight.** Both papers value counterfactuals at resolution. Fair after market end (outcome public); before end (row 11: 81–85%) it mixes skill and luck and is not an ex-ante value. [C]'s sample is selected on near-end timing; [S] prices gas/collateral at 2026-08-15.
- **V1 vs V2 (exchange versions).** V2 (2026-04-28) removed `incrementNonce`, moved to pUSD, dropped Fee Modules; Deposit Wallets followed 2026-05-04 ([S] §3). Dominant failure moved from balance (V1: 946,669) to receiver callback (V2: 748,119). [C] ends 2026-05-22 (~3.5 weeks of V2) with no version split. Paper versions differ too: [S] v1 = 1,952,440 reverts to 2026-05-06; v2 = 2,037,304 to 2026-08-15.
- **Successful and unsubmitted matches.** Both datasets are reverted transactions only. [S] observes daily total matchOrders (row 2 rates) and 61.0M successful deliveries (gas comparison, §6.1), not successful matches per order. CLOB-side cancellations before submission are out of scope ([S] §9). Per-order and per-user failure rates: **denominator not observed**.

## D. Implications for a price-hold product

1. **Our atomic buy path does not have the ghost-fill problem**, which is an off-chain-match / on-chain-settle gap. A single Solana tx with a max price fills or leaves no state change. The hold solves a different problem (time to decide at a known price); do not claim it fixes the harms in rows 1–11.
2. **Escrow is the defense both papers recommend, and we have it** ([C] §VI-C; [S] App. D, "escrowing an order owner's collateral at order placement"). The ~8% to 0.04% drop after Deposit Wallets (row 2) is the best evidence it works. Maker YES in program custody satisfies [C] Property 2 on the maker side; settle each hold separately to respect Property 1 (row 14).
3. **A hold is an option, and holders exercise options on information** (rows 11, 13: 98–99% of post-end cancellations avoided a loss). The fee must cover the option value over N seconds plus the maker's adverse-selection cost. No hold may span market close; in short-horizon crypto markets keep N tiny or disable holds.
4. **Strongest argument against: we would rebuild, and sell, the free look the attackers exploited, with the maker carrying the risk.** Maker inventory is frozen while only the buyer can walk. [CJW] and [O] predict this gets priced into a wider ask, so non-holders subsidize holders and average cost may not fall ([O]). Most of the consumer benefit (a price shown as final is final) may come from atomic execution plus an honest "provisional until confirmed" label, which is what [S] App. D tells participants to do.
5. **Measure in the demo, per unique hold:** exercise rate; fee vs realized option value; maker P&L on exercised vs expired holds; replacement cost after expiry. Report rates only with the full logged denominator, including holds never exercised.
