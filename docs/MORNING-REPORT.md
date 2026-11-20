# Morning report — overnight firm-quote build

## What changed my mind (lead)
Your hypothesis was a firm quote for a prediction contract. The research and our own replay narrowed it:
- **Economics:** on identical seeded paths, a plain atomic buy with a max price beats a priced hold in calm, normal and thin markets; the hold wins only in volatile markets, and only because a flat fee underprices it there. At a fair fee it's a transfer, not value creation. What survives is **fill certainty** (thin book: 1.62 → 0.39 unfilled shares/order).
- **Skeptic review:** firm quote (C1), receipt-only (C2) and disclosed last-look (C4) **failed**; the informed choice "buy now vs priced hold" (C3) **passed conditionally**, narrowed to "a disclosed, fee-priced, maker-escrowed option on test assets". Novelty as a mechanism is not substantiated (Hopper Price Freeze; RFQ on Kalshi/Polymarket/Gemini/Jupiter Z; PsyOptions on Solana). What is distinctive is that the reservation is **provable custody** with no last look.
- **Protocol review** found a real flaw that I fixed before deploy: paying the maker's own token account let a maker close it to block exercises (a silent renege). Proceeds now go to a pool-owned vault.

So we shipped: **Buy now (default) + explicitly priced Hold**, with a wallet-free receipt verifier and an Evidence page that says plainly where the baseline wins.

## Frozen sentences
- **User:** someone buying YES shares on a binary question from a thin book who needs seconds to decide.
- **Decision:** buy now at the executable ask, or pay a disclosed, volatility-priced fee to hold it for N seconds.
- **Advantage:** reserved shares sit in program custody; until expiry they can only go to the holder at the held price — no last look, provable from chain state.
- **Assumption:** in thin/volatile books, fill certainty is worth more than the fee; makers price the fee from volatility.
- **Falsifier:** if buy-now + honest labels leaves buyers no worse off (incl. unfilled residual) than paying the fair fee, the hold adds nothing. Our replay says this holds in calm/normal markets on $ terms — hence Buy now is the default.

## Implemented · observed · simulated · blocked
| | |
|---|---|
| **Implemented** | `held_quote` Anchor program (13 ix: market/split/resolve/redeem, open_pool/set_terms/deposit/withdraw/claim_proceeds, buy_now/hold/exercise, release). Deployed to devnet `32LnKdWnNk93W4C1pD4s3DjdTUAw4aGZZr6tbRMpw8e3`. New frontend (order ticket, honest tx lifecycle, wallet-free receipt verifier, Evidence page, read-only Gemini adapter). Replay harness. |
| **Observed** | Real devnet transactions (seeded examples + every E2E run). Gemini public order book (read-only GETs; snapshots saved with timestamps). |
| **Simulated** | All economics (seeded synthetic paths). The "maker reprices" button (labelled; real `set_terms` tx by the test maker). |
| **Blocked / not done** | No "Gemini prediction markets tool" exists in the session → used public endpoints. The reading-list .docx wasn't attached or in Drive → followed paper citations. land-book.com returns 403 to the sandbox → design lead used search + live sites. **Vercel preview is behind Vercel Authentication (SSO)** → I couldn't verify it in a browser; see "Your steps". No real venue integration. |

## Verification (all ran)
- Rust unit tests 5/5 · local-validator integration 23/23 (incl. last-lot race, randomized state machine with conservation checks) · browser E2E on devnet (buy now, max-below-ask rejected pre-sign, hold → reprice → exercise at held price, expire → release, refresh mid-tx resumes, wallet rejection, 7/7 receipts verified wallet-less, 390 px mobile, keyboard).
- Secret scan: no keys in tracked files; no secret values or names in the client bundle.

## Identifiers
- Branch `claude/firm-quote` (worktree), pushed to AVcool3/UBC. Rollback: `main` / ubc-seven.vercel.app (Ghost Checkout) untouched.
- Program `32LnKdWnNk93W4C1pD4s3DjdTUAw4aGZZr6tbRMpw8e3` (upgrade authority `BRAtnnAhQ8peQDPkaTtFCYxnNeGqAbBk15zfgZNWFfwf`), market `gnEJjx6joydxAyRvMGxHfdV26niTpyy46KwU4PvKzUd`, pool `BQEGNeDdEnXLnsu97n8DfefFtDsJLDHQJ7NSM2Rtvunx`, test USDC `Crsx17TuZzj6Mna53EsSnLQRPfwXuSYnu3Z8kJvi3vfm`.
- Verified example: held → bought `hDLWb3vMbtnToRBeVA1SHgCKTrDVZuLqPUPC4S5S48Bv3bgXmLJabhHTLTk5TYPZ5U1mPwcWewXB9EFuMo78zSc`.

## Your steps
1. Vercel → project **ubc** → Settings → **Deployment Protection** → turn off **Vercel Authentication** for Preview (or use "Shareable link"). Preview URL: `https://ubc-git-claude-firm-quote-avcool3s-projects.vercel.app`.
2. Check the preview has the env vars (Settings → Environment Variables → Preview): `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_CLUSTER`, `NEXT_PUBLIC_DEMO_MODE=true`, `DEMO_FAUCET_KEY`, and `DEMO_SELLER_KEYS` (or a new `DEMO_MAKER_KEY`). The ones you pasted for Ghost Checkout already work if they were applied to Preview.
3. Decide which product to submit. Held (new) is on the branch; Ghost Checkout is still live.
