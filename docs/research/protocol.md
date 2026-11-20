# Protocol review: held_quote

Protocol engineer, 2026-11-20. This critiques the RUNLOG "Frozen mechanism spec" and does not change the schema. **[REC]** marks a recommendation.

## 0. Facts that shape the analysis (checked 2026-11-20)

- **Alpenglow is live on devnet** (2026-09-25; mainnet reported 2026-10-21, secondary sources). Under Alpenglow, *Confirmed == Finalized* and cannot be rolled back (docs.anza.xyz/consensus/commitments).
- **Clock.unix_timestamp**, TowerBFT path: a stake-weighted median, bounded to 25% fast / 150% slow drift, and clamped so it is never below the parent's value (agave `bank.rs::update_clock`, `stake_weighted_timestamp.rs`). Alpenglow path: the parent block's **leader-supplied footer time**, in whole seconds (`update_clock_from_footer`). We found no clamp in the Alpenglow path.
- **Blockhash expiry:** 150 blocks, about 60-90 s (solana.com/docs/core/transactions).

## 1. State machines

`[B]` buyer, `[M]` maker, `[P]` program-PDA custody, `*` anyone.

### (a) Prefunded atomic exchange

```
          M deposit YES          B deposit USDC
 (none) --------------> OFFERED --------------> MATCHED --swap(*)--> SETTLED
                        YES:[P]                 YES,USDC:[P]         YES:[B] USDC:[M]
              M cancel |               B cancel |
                       v                        v
                  CANCELLED(YES->M)        OFFERED(USDC->B)
```
- **Who may cancel:** each side can withdraw only its own leg before the swap. Either side can trigger the swap.
- **If the coordinator dies:** both legs sit in [P], so nothing is lost, provided the cancel path needs no server.
- **What the receipt proves:** both legs are locked, on stated terms.
- **What the receipt does NOT prove:** that a match will occur, or that the price is fair.
- **Commitment:** deposits at `confirmed`. Show "settled" at `finalized`, which costs nothing extra on devnet.

### (b) Off-chain indication, then atomic execution (`buy_now`)

```
 maker server sets ask (seq++)          B: buy_now(qty,max_price)
 AVAILABLE ------------------------------------------------------> SOLD
  YES:[P]     one tx: USDC B->M, YES [P]->B, available-=qty
              ask>max_price or available<qty  => revert, no state change
```
- **Who may cancel:** the maker, by changing the ask or withdrawing `available`. The buyer has nothing to cancel. Blockhash expiry bounds how long a submitted tx can hang.
- **If the maker server dies:** the last ask **stays executable indefinitely**. That makes it firm, and a stale-quote risk for the maker.
- **What the receipt proves:** a fill at `ask <= max_price` at slot S.
- **What the receipt does NOT prove:** best execution, or anything about the Gemini reference price.
- **Commitment:** show "bought" at `confirmed`.

### (c) Expiring one-sided reservation (`hold`)

```
           hold(nonce,qty,secs,max_price,max_fee); fee B->M, non-refundable
 AVAILABLE --------------------------------------> HELD{price,qty,expires_at}
  YES:[P]                                           YES:[P] reserved; USDC stays [B]
                       exercise(B, now<expires_at) |   | release(*, now>=expires_at)
                                                   v   v
                     EXERCISED(USDC B->M, YES->B)       RELEASED(reserved->available)
                     terminal, PDA kept                 terminal, PDA kept
```
- **Who may cancel:** the buyer can only let the hold lapse (the fee is sunk). The maker **cannot** cancel. Anyone can release after expiry.
- **If the maker server dies:** the hold is fully enforceable, because the shares are in [P] and the maker does not need to sign.
- **What the Hold PDA proves:** that at slot S the program reserved `qty` at a frozen `price` until `expires_at`, and the buyer paid `fee`.
- **What it does NOT prove:** that the hold is still live (you must read `status` + Clock), that it was filled ("Price held" is not "filled"), or that the buyer will exercise.
- **Commitment:** show "Price held" at `confirmed` (the same as finalized on devnet). A crank can retry release at `processed`.

## 2. Estimates per lot (400 ms slots, Alpenglow devnet)

| | (a) prefunded | (b) buy_now | (c) hold + exercise/release |
|---|---|---|---|
| Tx / sigs | 3 / 3 (M, B, crank) | 1 / 1 | 2 / 2 (release: any signer) |
| Writable accts | 3 + 3 + ~6 | ~5 (pool, vault, B-YES, B-USDC, M-USDC) | hold ~5 incl. new PDA; exercise ~6; release 2 |
| Latency to confirmed | ~3-6 slots (1.2-2.4 s) | 1-2 slots (0.4-0.8 s) | 1-2 slots per tx. TowerBFT finalized adds ~32 slots (~13 s) per tx |
| Stranded capital | maker shares x order life, plus buyer USDC x wait | none beyond pool inventory | `qty x hold_secs` (10 x 300 s = 3,000 share-s) **+ `qty x (release_ts - expires_at)`** |
| Integration burden | high (2 deposits, matching, crank, cancel UX) | lowest | medium (nonces, timers, release crank, fee disclosure) |
| Rent | refundable escrow | 0 | ~0.0017 SOL/hold, **never refunded** (PDA never closed) |

## 3. Existing primitives: verdict

| Primitive | Why it is not our hold |
|---|---|
| **Blockhash expiry** (solana.com/docs/core/transactions) | Gives a maker-signed quote tx ~60-90 s of validity for free. Inventory is not locked, and the window is not configurable. |
| **Durable nonce** (solana.com durable-nonce guide) | The nonce authority can advance the nonce at any time, which is a unilateral maker cancel. There is no expiry. |
| **SPL Approve/delegate** (solana-program/token `interface/src/state.rs`) | Allows **one** `delegate: COption<Pubkey>` per token account. It has no expiry, the owner can still transfer or `Revoke`, and it does not enforce payment. A token-delegation "quote" is revocable and unpaid, so it is not a firm hold. |
| **Jupiter Z RFQ** (developers.jup.ag RFQ v1 webhook; jupiterz.jup.ag v2) | Webhook replies within 250 ms. A quote is valid 55 s (v1) or `quote_expiry_time` >= 10 s (v2). The maker signs at settlement in the Order Engine. This is design (b): there is no buyer-paid reservation. |
| **OpenBook v2 `expiry_timestamp`** (`state/orderbook/book.rs`) | A maker time-in-force (expired orders are dropped during matching). It gives the taker no option. |
| **PsyOptions American** (mithraiclabs/psyoptions `psy_american`) | **Structurally identical** to our hold: the underlying is escrowed, the holder exercises at strike before `expiration_unix_timestamp`, and the premium plays the role of our fee. But it needs a new option market and mints per (strike, expiry), which is too heavy per quote. |

**Verdict:** no existing primitive replaces the custom hold. Keep plain SPL transfers signed by the pool PDA, and do **not** model the hold as a token delegation.

## 4. Invariants the tests must prove

1. **Conservation:** after every instruction, `vault.amount == available + reserved`, and `available + reserved + sold + withdrawn == deposited`.
2. **No double fill:** a hold leaves `Active` exactly once. Exercise/exercise, release->exercise and exercise->release all fail, and balances are unchanged.
3. **Boundary:** at `now == expires_at`, exercise fails and release succeeds. At `expires_at - 1`, the reverse. Never both.
4. **Release is accounting only:** called by an arbitrary signer, release moves no tokens. It does `reserved -= qty` and `available += qty`, and pays the caller nothing.
5. **Beneficiary-only exercise:** any other signer fails, even when all accounts are otherwise valid.
6. **Frozen price:** a maker `set_ask` (seq++) after a hold changes neither `hold.price` nor the amount paid at exercise.
7. **Reserved is untouchable:** maker withdrawals are capped at `available`. `buy_now` and new holds never consume `reserved`.
8. **Slippage guards:** if `ask > max_price` or `fee > max_fee`, the instruction reverts.
9. **Fee:** `fee == ceil(rate*qty*secs/60)` computed in u128 (for example, 1, 1, 1 gives 1). `secs == 0` and `secs > max_hold_secs` are rejected.
10. **Overflow:** inputs near u64::MAX return a custom error, never a wrap or panic. Use `checked_*`; `overflow-checks = true` is already set.
11. **Binding:** each of these fails: a wrong pool for the hold, a wrong YES mint, a vault not owned by the pool PDA, a substituted maker USDC account, and a wrong token program (`has_one`, `seeds`, `token::mint/authority`).
12. **Nonce:** reusing `(pool, buyer, nonce)` fails because `init` collides.

## 5. Spec risks

1. **No explicit terminal state.** Holds are never closed, so a release after an exercise could double-credit `available`. **[REC, strong]** Add `Hold.status ∈ {Active, Exercised, Released}`, and make every transition require `Active`.
2. **The maker can brick exercise.** If exercise pays into the maker's own USDC ATA, the maker can close that ATA (or a freeze authority can freeze it). Exercise then fails until expiry, after which the maker releases and resells. **[REC, strong]** Route proceeds to a **pool-owned proceeds vault** that the maker withdraws from.
3. **Timestamp vs slot.** Under Alpenglow the leader sets the timestamp, in seconds, and we found no monotonic clamp, so the leader can nudge the boundary by a few seconds. That is fine for minute-scale holds. Compute `expires_at = clock.unix_timestamp + secs` on-chain, never from client input.
4. **Stale ask.** The ask has no TTL. If the server dies, the maker is exposed to execution at an old price. Disclose it.
5. **Terms change in the same slot.** The maker can raise the ask or rate just ahead of a buyer. `max_price` and `max_fee` cover this only if the UI sends tight bounds, never u64::MAX.
6. **Last-lot race.** `buy_now` and `hold` both write-lock the pool and serialize. The loser should be shown "sold out", not a generic error.
7. **Stranded reserved shares.** Nothing auto-releases expired holds. **[REC]** The client prepends `release` for expired holds to its `buy_now`/`hold` txs, plus a crank script. No schema change is needed.
8. **Rent.** The buyer pays ~0.0017 SOL per hold and cannot recover it. Disclose this.
9. **Rounding.** `ceil` favours the maker by less than 1 base unit. Do not divide in u64 before multiplying.

Extra sources (fetched 2026-11-20): docs.rs solana-clock 4.0.0; crowdfundinsider.com (2026-09) and solanacompass.com (Alpenglow devnet).
