# Priced hold vs atomic buy: simulation results

**Bottom line: on these synthetic paths the baseline (A/B, indicative quote + atomic buy) wins in placid, normal and thin markets.** At a maker-break-even rate the priced hold (C) helps buyers only in the volatile regime, and priced *for* volatility that gain is about zero. The hold's reliable benefit is fill certainty in thin books, which the dollar figures exclude.

Run: `pip install -r econ/requirements.txt && python3 econ/harness.py && python3 econ/test_fixture.py` (seed 20261120; all numbers in `econ/results.json`).

## Method
- **SEEDED SYNTHETIC paths, not venue data**: logit random walk, 1 s steps, Poisson jumps. Ask = mid + half-spread rounded up to the $0.01 tick, on a uniform depth ladder; integer micro-dollar money. No calibration, no "ghost probability" fit.
- **Regimes** (realised vol, probability points/√min): placid 0.13, normal 1.23, volatile 4.97, thin 1.25 (3 levels × 8 shares, 4-tick spread, depth zero ~22% of the time).
- **Order**: q ∈ {5,10,20,40}, size-aware quote at t0; decision latency D lognormal (median 20 s, σ=1); retry latency 5 s; tolerance 0; p_abandon 0.15. Thin: 899/4000 arrivals saw no ask and are excluded.
- **A**: `buy_now(q, a0)` at t0+D, all-or-nothing; on a miss, market buy at t0+D+5 s walking depth; unfillable shares counted, never priced. **B**: identical fills/economics on every path; benefit is informational only.
- **C**: fee = ceil(rate·q·H/60). D < H: exercise at a0 (or buy at market if cheaper). D ≥ H: expired, follow A's path, fee sunk. Abandon: fee is pure cost.
- **No lookahead**: book reads go through an `Observer` that raises on any t > decision time (tested); D, q, abandonment independent of the path. Identical paths for A/B/C.
- n = 4000 per cell; bootstrap 95% CIs (1000 resamples). Network: 5000 lamports/signature at an **assumed SOL = $150** ($0.00075). Maker opportunity cost **assumption**: locked shares would otherwise turn over at 1/600 per s, earning half the spread.

## Recommended hold rate
Normal regime, H = 60 s: maker fee revenue equals option payout q·max(a(t0+D) − a0, 0) at **$0.001242/share-min** (`hold_rate` 1242 micro-USDC; ≈ $0.025 to hold 20 shares for 60 s). Including opportunity cost and the release signature, break-even is $0.00177.

Option-only break-even by H (10/30/60/120 s): 0.00104 / 0.00144 / 0.00124 / 0.00076 $/share-min.

At this rate, placid buyers overpay about 6× (placid break-even $0.00021) and volatile holds are underpriced about 4× (break-even $0.0052). Charged its own break-even rate, each regime's buyer advantage is ≈ 0 or negative (placid −0.002, normal −0.004, volatile −0.005 [CI −0.015, +0.007], thin −0.007 $/order). A fairly priced hold moves value between buyer and maker; it does not create any.

## Per-regime results (H = 60 s, rate $0.001242/share-min; mean [95% CI])

| | placid | normal | volatile | thin |
|---|---|---|---|---|
| n quoted | 4000 | 4000 | 4000 | 3101 |
| A limit-miss rate, pp | 3.2 [2.6, 3.7] | 13.9 [12.8, 14.9] | 28.5 [27.1, 29.9] | 24.4 [23.0, 25.9] |
| Signed replacement cost, $/replaced order (n) | 0.128 (126) | 0.235 (554) | 0.481 (1140) | 0.082 (756) |
| Adverse-only part, $/replaced order | 0.128 | 0.235 | 0.493 | 0.088 |
| Gross protection at use, $/live hold | 0.005 | 0.032 | 0.132 | 0.028 |
| Fee, $/order | 0.023 | 0.023 | 0.024 | 0.019 |
| Maker option payout, $/hold | 0.004 | 0.023 | 0.098 | 0.020 |
| **Maker net** (after opportunity cost + release fee), $/hold | +0.009 [0.008, 0.010] | −0.010 [−0.013, −0.007] | −0.084 [−0.095, −0.073] | −0.018 [−0.021, −0.015] |
| Inventory lock, share-s/hold | 574 | 585 | 572 | 467 |
| Signatures/order, A / C | 0.88 / 1.86 | 0.99 / 1.89 | 1.13 / 1.90 | 1.10 / 1.91 |
| **Buyer advantage C − A**, $/order (fee + network incl.) | **−0.021** [−0.022, −0.020] | **−0.004** [−0.007, −0.001] | **+0.070** [+0.060, +0.081] | **−0.005** [−0.008, −0.003] |
| Unfillable residual, shares/order, A / C | 0 / 0 | 0 / 0 | 0 / 0 | **1.62 / 0.39** |

Signed replacement cost = q × (replacement avg ask − t0 executable avg ask); each replacement also costs one extra signature ($0.00075). Gross protection is a **stylised gross price-protection benefit, neither a fair option premium nor a venue loss estimate.**

**Sweeps.**
- **H** (see chart): longer holds widen both effects. Placid −0.042, volatile +0.088 $/order at H = 120.
- **Normal regime, H = 60, volatility multiplier**: 0.5× → −0.015; 2× → +0.018; 4× → +0.062 $/order. Break-even rate scales about with the multiplier: $0.0006 / $0.0024 / $0.0046.
- **D median**: 5 s → −0.012; 60 s → −0.008 $/order.
- Spread and level size barely matter.

## Hand fixture (`econ/test_fixture.py`, passes)
q = 20, held/binding price $0.60:

| Later ask | Buyer-held hold: gross protection | BINDING buy at $0.60 vs waiting |
|---|---|---|
| $0.64 | **+$0.80** before costs | $0.00 worse |
| $0.56 | **$0.00** | **$0.80 worse** |

## One worked observation: Gemini snapshot, retrieved 2026-11-20T09:13:44Z
This is one public read-only GET of `/v1/book/GEMI-FED261211-HIKE25`. It is a display-only reference, not a time series.
- **Book**: top ask $0.93 × 25, then $0.94 × 6666.
- **Size effect**: a 40-contract buy walks the book to $37.35. An atomic buy limited at the displayed $0.93 fails with no price move at all; replacing it costs $0.15 because of size alone.
- **Hold economics**: a 60 s hold on 40 shares at our rate costs $0.0497, and a one-tick move is worth $0.40 gross.
- **Lesson**: quote the walked size price, not the top of book.

## Conclusion
- **Ship A+B as the default.** Truthful labels cost nothing.
- **Offer C only as an opt-in** at about $0.00125/share-min with H ≤ 60 s.
- **Placid buyers lose** at any rate that covers option payout.
- **The hold pays buyers in volatile markets** only because a flat rate underprices it there. Makers should scale the rate with realised volatility.
- **In thin books, the honest case for C is fill certainty**: 1.62 → 0.39 unfilled shares/order. Price protection is not the reason.
