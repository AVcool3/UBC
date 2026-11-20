# Review 2: code, receipt and trust check (held_quote on devnet)

Reviewer: independent second pass, 2026-11-20. Scope: `contracts/programs/held_quote/src/**`, `contracts/tests/held_quote.ts`, `frontend/src/app/api/**`, `frontend/src/lib/send.ts` and `frontend/src/components/TxRoute.tsx`, plus live devnet state. I wrote my own client for the receipt check: raw JSON-RPC via curl, plus a Node decoder that imports only `PublicKey` from web3.js. It did not use `frontend/src/lib/receipt.ts`. The script and raw RPC dumps are in `/tmp/claude-0/-home-user/87f94d88-f6a2-5578-849f-af300f9dcfd0/scratchpad/rc/`.

**Bottom line:** no critical bugs. The custody logic is correct: reserved shares cannot leave the vault except through exercise by the beneficiary, and double fulfilment and double release are blocked. Three **high** findings break the headline claim ("nobody can take your held price") or the demo itself:
- **H1:** the admin can resolve early, which voids every live hold and keeps the fee.
- **H2:** the program is upgradeable by a single key.
- **H3:** one free faucet drip can lock the whole pool.

## 1. Findings

| # | Sev | Where | Failure scenario | Fix |
|---|---|---|---|---|
| H1 | **high** | `instructions/market.rs:508-521` (`resolve` has no time gate) together with `instructions/trade.rs:328-329` (exercise blocked once resolved); the behaviour is enshrined in `tests/held_quote.ts:539-560` | A buyer pays the fee and holds 10 YES at $0.93 with 60 s to run. The admin (`2nvgRQ…buP`, one key) resolves at second 5, long before `close_time` (2026-12-09). `exercise` now fails with `MarketResolved`, the fee stays with the maker and the buyer gets nothing. This falsifies the guarantee stated in `lib.rs:4-8`. If the admin is or colludes with the maker, resolving NO against a hold also keeps the shares unsold. | `require!(now >= market.close_time)` in `resolve`. `hold` already enforces `expires_at <= close_time` (`trade.rs:198`), so every hold is dead before resolution and the conflict disappears. Otherwise, refund `fee_paid` on holds that resolution blocks. Update the test to assert that early resolve is rejected. |
| H2 | **high** (trust) | Deployed program: `solana program show` reports **Owner BPFLoaderUpgradeab1e…, Authority `BRAtnnAhQ8peQDPkaTtFCYxnNeGqAbBk15zfgZNWFfwf`**, last deployed in slot 524309088 | Whoever holds `BRAtnn…` can redeploy a program that sends vault shares anywhere. "The chain enforces the hold" really means "the chain enforces it while this key chooses not to upgrade". | Disclose this in the README and on the receipt page. After the demo, run `solana program set-upgrade-authority 32Ln… --final`, or hand the authority to a multisig. Never claim "nobody, including the app" while the program is upgradeable. |
| H3 | **high** (demo DoS) | `trade.rs:181-202` (no per-hold or per-buyer cap), `state.rs:233-237` (`PoolTerms` has no max qty), `app/api/demo/faucet/route.ts:119-152` | Live pool: `available=257`, `hold_rate=1250`, `max_hold_secs=60`. One hold of 257 for 60 s costs a fee of 257×1250 = **$0.32** plus 0.002 SOL rent. One faucet drip ($20 USDC + 0.03 SOL, free) re-locks the whole inventory every minute for about an hour. During judging every visitor then sees "Only 0 available". `buy_now` can drain the pool in the same way using free USDC. | Add `max_hold_qty` to `PoolTerms` and enforce `qty <= max_hold_qty`. Also cap active holds per buyer, for example with a counter PDA, or just a low qty cap. For the demo, a monitor script should re-deposit inventory. Cap the faucet globally, not only per IP. |
| M1 | medium | `app/api/demo/reprice/route.ts:183-203` | Any anonymous visitor can move the maker's on-chain ask by ±$0.03, up to 30 times a minute globally. A judge's quote can change because of a stranger. Combined with H3, a griefer can hold low, pump the ask and exercise. On test assets this costs nothing, but it makes the "maker" a public knob, not a maker. | Gate it behind a demo secret or a per-session simulated maker. At least show "last repriced by a visitor at T" next to the ask. |
| M2 | medium | `state.rs:191` (Hold "never closed"), `components/Ticket.tsx:39` | Each hold permanently locks **2,006,600 lamports** of rent (measured: payer delta −2,011,600 including the 5,000 fee). The "disclosed fee" in the example hold was $0.01 (10,000 base units), so the undisclosed rent is far larger than the fee on any priced SOL. On mainnet this is a real hidden consumer cost. | Either show the rent as part of the cost of holding, or add `close_hold` after settlement. Have it refund rent to the buyer and keep the receipt as the emitted event plus tx signature. |
| M3 | medium | `lib/server/rateLimit.ts:6-25` | The limiter is held in memory per serverless instance, so limits are not global. `hits.clear()` at 5,000 keys resets everyone's limits. The key is the first `x-forwarded-for` entry (Vercel sets it, but any other host would let clients spoof it). The faucet's only global protection is the faucet wallet's SOL balance. | Add a global daily budget to the faucet (stop at N drips, or below X SOL left). Prefer Vercel's `x-real-ip`. Evict the oldest keys instead of clearing the whole map. |
| L1 | low | `lib/send.ts:96-103` | If one `getSignatureStatuses` returns null after `lastValidBlockHeight`, the UI shows "failed… Nothing happened". `api.devnet.solana.com` is load-balanced, so a lagging node can return null for a tx that landed. The user then retries a buy they already own. | Before declaring expiry, re-query 2–3 times and make one `getTransaction` call. Word the message as "didn't land as far as we can see; check Explorer". |
| L2 | low | `lib/send.ts:122-125` with `TxRoute.tsx:35` | After 90 s without `finalized`, the watcher stops and leaves "Confirmed: … Final in a few seconds." on screen indefinitely. That is not false (confirmed is true) but the text goes stale. | After the timeout, change the copy to "Confirmed; finality not yet observed". |
| L3 | low | `Ticket.tsx:146-150` and `:157-160` | The faucet and reprice results are rendered as stage `confirmed` because the *server* said so, with no client check. The server does use `confirmed` commitment (`sendAndConfirmTransaction`, `AnchorProvider{commitment:"confirmed"}` in `lib/core.ts:47`), so this is honest but unverified. | Run the returned signature through `watchSignature`. |
| L4 | low | `instructions/market.rs:299-371` | `create_market` is permissionless and accepts any collateral mint with any decimals. `SHARE_UNIT` assumes 6 decimals, so a 9-decimal mint makes "$1" equal 0.001. The UI pins `MARKET` from `deployment.json` (`lib/contracts.ts:21-24`), so only third-party indexers are at risk. | Require `collateral_mint.decimals == 6`, or store the decimals and scale by them. |
| L5 | low | `state.rs:240-251` | `hold_rate = 0` is valid, which allows free options and makes H3 cost nothing at all. | Require `hold_rate >= 1` or a floor. |
| L6 | low | `app/api/reference/route.ts:49-50` | `res.text()` buffers the whole body before the 64 KB check. The host is fixed, so the risk is only memory. | Stream and abort past `MAX_BYTES`, or check `content-length` first. |
| I1 | info | `pool.rs:190-193` | Shares transferred straight into `yes_vault` by plain SPL transfer break `vault == available + reserved` upward and are stranded forever. Harmless. | Make the invariant ">=" in tests and docs, or add a `sweep` that only the maker can call. |
| I2 | info | `trade.rs:91,195` | `SelfTrade` only compares keys, so a maker with a second wallet can self-trade. This is fine for the demo. | Document it. |

**Checks that passed (code review):**
- **Reserved shares stay in the vault.** The only YES outflows from the vault are `deliver`, called by buy_now and exercise (`trade.rs:445-472`), and `withdraw`. Withdraw requires `shares <= available` (`pool.rs:193`), buy_now requires `available >= qty` (`trade.rs:93`), and `release` only does accounting (`trade.rs:407-410`).
- **No double fulfilment or double release.** The `status == Held` checks at `trade.rs:326` and `:403` prevent both, and are tested at `tests:379` and `:383`.
- **Expiry boundary is correct.** `can_exercise` (`<`) and `can_release` (`>=`) at `state.rs:271-279` are mutually exclusive and unit-tested.
- **Fee arithmetic is safe.** `hold_fee` uses u128 with `div_ceil`, is property-tested to within 1 unit above exact, and overflow is an error.
- **Overflow checks are on.** `overflow-checks = true` is set, and checked arithmetic is used throughout.
- **Signer and PDA constraints are correct.** Seeds and `has_one` constraints bind market→mints, pool→market/vaults, and hold→pool/buyer.
- **Token accounts are checked.** `buyer_collateral` has `token::authority = buyer`, and `transfer_checked` re-checks mints.
- **`init_if_needed` is used safely.** It appears only on ATA-derived buyer accounts.
- **The proceeds vault is safe.** It is an ATA owned by the pool, so the maker cannot close it to block exercises. Only the maker can claim from it (seeds plus `has_one`, tested at `tests:526`).
- **The reference route has no SSRF.** It uses one hard-coded host, `api.gemini.com/v1/book/{pinned symbol}`, and the symbol comes from `deployment.json`, not from the request.
- **No secret exposure.** Keys are read only from non-`NEXT_PUBLIC_` env vars.

## 2. Independent receipt check (exercise tx `hDLWb3vM…zSc`)

| Check | Raw value | Result |
|---|---|---|
| Tx succeeded | `meta.err = null`, `confirmationStatus = finalized`, slot 524309509, blockTime 1795167454; log `Instruction: Exercise`, 2× Token `success` | PASS |
| Buyer +qty YES | ATA `GCHztm…Nhk5j` (owner `J34fXg…7dB`, mint `9WH43c…`): 5 → 15, **+10** | PASS |
| Buyer −price×qty USDC | ATA `EDkvYc…2n`: 35,340,000 → 26,040,000, **−9,300,000** = 930,000 × 10 | PASS |
| Pool proceeds +price×qty | `2z3C9a…Mjd` (owner = pool PDA): 4,660,000 → 13,960,000, **+9,300,000** | PASS |
| Pool YES vault −qty | `75kjJa…a49` (owner = pool PDA): 295 → 285, **−10** | PASS |
| Vault ATAs are the pool's | derived ATA(pool, yes) = `75kjJa…a49` and ATA(pool, usdc) = `2z3C9a…Mjd`, matching `pool.yes_vault` / `pool.proceeds_vault` | PASS |
| Hold account owner | `4j1mby…ZQs` owner = `32LnKdWn…8e3`, 267 bytes, discriminator `[110,65,238,142,146,91,196,171]` = IDL `Hold` | PASS |
| Hold PDA | `find_program_address(["hold", pool, buyer, nonce_le(1795167451279)])` = `4j1mby9NSXo1ZbHQqDm83CPC7sXaGd9mv19EYBTaFQZs`, bump 254 = stored bump | PASS |
| Pool and market PDAs | `["pool", market, maker]` → `BQEGNe…unx`; `["market", 1u64le]` → `gnEJjx…zUd` | PASS |
| Stored fields | buyer `J34fXg…7dB` (= tx signer); qty 10; price 930,000; status 1 = Exercised; created 1795167451, settled 1795167453, expires 1795167511, so settled < expires; fee_paid 10,000; terms_seq 1 | PASS |
| Event matches | `Filled` (discriminator `[134,4,17,63,…]`): schema 1, kind 1 (held), qty 10, price 930,000, total 9,300,000 | PASS |
| Fee actually paid | hold tx `11EziA…6m2`: buyer USDC −10,000, proceeds +10,000 = ceil(1000×10×60/60) at terms_seq 1 | PASS |
| Live invariant | vault balance 277 == available 257 + reserved 20 | PASS |

## 3. Can "unknown" render as success?

**No.**
- In `send.ts:111-119`, `unknown` is set only after more than 20 s without RPC contact, and never once the tx is `confirmed`.
- In `TxRoute.tsx:58-65`, `unknown` gets a warning tone and a "?" badge, never the green tone.
- `statusLine` for `unknown` says "We don't know yet… Don't try again".
- The Confirmed and Final steps light up only if an actual `confirmed`/`finalized` update exists (`reached()`, lines 50-56).
- `Ticket.tsx` triggers a refresh only on confirmed, finalized or failed.

The remaining honesty gaps are L1 (a false "nothing happened") and L2 (stale "Final in a few seconds"). Neither one claims success.

## 4. Trust assumptions (as deployed)

- **Program upgrade authority:** single key `BRAtnnAhQ8peQDPkaTtFCYxnNeGqAbBk15zfgZNWFfwf`, which can change every rule (H2). ProgramData `9aUi63…iF4`.
- **Test USDC `Crsx17…fm`:** 6 decimals. **mintAuthority `BjT4LvZSZYozc4hbQqCTQVNaX7jiFDZQt9MpBjX7E3hS`** (the faucet key, held in Vercel env, with unlimited minting); **freezeAuthority = null**, so nobody can freeze buyer accounts. Supply is 888 USDC. Collateral is worthless by design, so the fee economics are not tested by real money.
- **Market resolution:** single test admin `2nvgRQiDMGj59mDPsEoH5Ezp6LiRUKG1SvAcZpNbtbuP` (separate from maker `2PuQK4…kh`). It can resolve **at any time, to either outcome** (H1). The market is open, `close_time` is 2026-12-09T18:00Z, and 400 sets are outstanding.
- **Maker:** `2PuQK4…kh`. Its key sits in the Vercel env (`DEMO_MAKER_KEY`) and anyone can drive it through `/api/demo/reprice` (M1).
- **Cluster:** devnet. Its state can be reset, and there is no economic finality.
- **Reference feed:** read-only `GET api.gemini.com/v1/book/GEMI-FED261211-HIKE25`, cached for 5 s, falling back to "stale" or a "recorded" snapshot. `deployment.json` has `termsMatch:false`, so the resolver and settlement differ from Gemini's. The reference is never executable and gives the held price no backing.
