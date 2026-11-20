# RUNLOG: overnight firm-quote build

Compact log so the run can resume after context compaction. Newest entries at the bottom of each section.

## Identifiers (public)
- Repo: AVcool3/UBC. Baseline: `claude/loving-gauss-q7xuno` @ 95ba201 (Ghost Checkout + Blinks). `main` @ 85cab7b = Ghost Checkout, live at https://ubc-seven.vercel.app (ROLLBACK TARGET, untouched).
- Feature branch: `claude/firm-quote`, worktree `/home/user/ubc-fq`.
- Cluster: Solana devnet. Old program (Ghost Checkout) `9TBWXeFennM42nASPhYY78vbNGiMQK252csS9TdgKxdD` stays deployed for rollback.
- Test USDC mint (reused): `Crsx17TuZzj6Mna53EsSnLQRPfwXuSYnu3Z8kJvi3vfm` (mint authority = demo faucet key).
- Tools: solana-cli 4.4.1 (Agave), anchor-cli 0.32.1, node 22.23.5, Next 15.5.29, React 19.3.1. No Vercel CLI/token in sandbox → preview comes from Vercel's GitHub integration on push.
- Commit author: Anvith Vanukuri <113698786+AVcool3@users.noreply.github.com>, no Claude trailers (user requirement).

## Constraints / blocked
- "Gemini prediction markets tool": NOT installed in this session (no MCP/CLI). Fallback: documented public REST endpoints, read-only.
- "Prediction Market Microstructure & Integrity Research Reading List.docx": NOT attached and not found in Google Drive → follow citations from the two papers instead.
- land-book.com returns 403 to the sandbox → design lead uses search results / cached pages; recorded as limitation.
- Deadline: Devpost 12:00 CST Nov 20. Run started 03:06 CST → plan compressed to ~6h so the user can record.

## Frozen mechanism spec (shared schema; program, UI and econ all follow this)
- Units: outcome shares are integers (mint decimals 0). Collateral = test USDC, 6 decimals. Prices in collateral base units per share, tick 10_000 ($0.01), 0 < price < 1_000_000.
- Market PDA ["market", id_le]: admin, collateral/yes/no mints (market PDA = mint authority), collateral vault, question, resolution source, reference symbol, status/outcome. `split(n)` mints n YES + n NO for n × $1 (shares fully collateralized, test assets). `resolve`/`redeem` = later step, admin-resolved (test).
- Pool PDA ["pool", market, maker]: maker's YES inventory in a pool-owned vault. Fields ask, hold_rate (base units per share-minute), max_hold_secs, available, reserved, sold, seq (bumps on every terms change), updated_at. Invariant: vault balance == available + reserved.
- buy_now(qty, max_price): atomic, fails if ask > max_price or available < qty.
- hold(nonce, qty, hold_secs, max_price, max_fee): fee = ceil(hold_rate × qty × hold_secs / 60) paid now to maker, non-refundable. Price = current ask, frozen. available -= qty, reserved += qty. Hold PDA ["hold", pool, buyer, nonce_le].
- exercise(hold): beneficiary only, requires now < expires_at; pays price × qty, receives qty YES atomically.
- release(hold): anyone, requires now >= expires_at; reserved → available. Non-overlapping boundary at expires_at.
- Hold accounts are never closed (they are the on-chain receipt). Every event carries schema_version = 1.
- Labels: a hold is "Price held", never "filled". Reference price (Gemini) is display-only and never executable.

## Decisions
- 03:06 Keep Ghost Checkout on main as rollback; build the new product on a new branch (user brief asks for a feature branch).
- 03:15 Reuse from old repo: Anchor workspace layout, escrow transfer helper pattern, scripts/common, `--use-rpc` deploy, DemoWalletAdapter, demo faucet route, toast/tx helpers, polling hooks, providers, UI primitives. Drop: all shopping/seller/carrier/arbiter/Blink routes and the ghost_checkout program on this branch.

- 03:40 Protocol review → payments/fees now go to a POOL-OWNED proceeds vault + `claim_proceeds` (maker could otherwise close their own ATA to make exercises fail = silent renege). Expiry boundary + fee rounding moved to pure fns with Rust unit tests (5/5 pass).
- 03:55 Research verdicts: reviewer → C1/C2/C4 FAIL, C3 CONDITIONAL PASS (narrow claim). Econ → atomic buy beats priced hold in placid/normal/thin on $; hold helps only in volatile; at fair rate it is a transfer. Hold cuts unfilled shares 1.62→0.39/order in thin market (certainty, not $). Gemini book GEMI-FED261211-HIKE25: 25 contracts at top ask 0.93 (snapshot 09:10Z) → thin.
- 03:55 FROZEN product sentences:
  * User: someone buying YES shares on a binary question from a thin book, who needs a few seconds/minutes to decide.
  * Decision: buy now at the executable ask, or pay a disclosed, volatility-priced fee to hold that price for N seconds.
  * Advantage: the hold is a maker-escrowed option — reserved shares sit in program custody and can only go to the holder at the held price (or back to the maker after expiry); no last look, provable from chain state.
  * Assumption: in thin/volatile books the value of fill certainty exceeds the fee; the maker prices the fee from volatility (hold_rate is a maker term).
  * Falsifier: if, on identical paths, buy-now + an honest pending/final label leaves buyers no worse off (incl. unfilled residual) than paying the fair hold fee, the hold adds nothing → our own econ says this is TRUE for placid/normal on $; only fill certainty in thin books survives. We ship it as an informed choice with "Buy now" as the default and say so.
- Reference market: Gemini `GEMI-FED261211-HIKE25` (Fed Dec 2026 hike 25bps). Our devnet market mirrors the question; resolver differs (test admin) → numeric comparison disabled (termsMatch=false), reference shown as display-only.
- Default maker terms: ask from reference (rounded to tick), hold_rate 1_000 base units/share-min (econ normal-regime break-even ≈ 1_242), max_hold 60s.

- 03:50 Program deployed to devnet (opt-level z → 334 KB, 1.70 SOL rent). Program `32LnKdWnNk93W4C1pD4s3DjdTUAw4aGZZr6tbRMpw8e3`. seed-market: market `gnEJ…KzUd`, pool `BQEG…vunx`, maker = seller-glow key (already in Vercel env as DEMO_SELLER_KEYS[0]), admin = arbiter key, 300 YES in custody, ask from live Gemini best ask (0.93). Example receipts in frontend/src/deployment.json.
- 04:20 Frontend replaced (Held): Ticket, TxRoute (simulate→sign→submitted→confirmed→finalized, "unknown"), receipt verifier, Evidence, /api/reference (fixed host, cached, labelled), /api/demo/{faucet,reprice}. React Bits Counter vendored for the countdown.
- 04:45 Devnet E2E passed (see README "Test results"). Fixed: raw InvalidAccountForFee → plain copy; "Checking your balance…" state; countdown digit bleed (fade 0, minDigits 2).
- 04:50 hold_rate set to 1250 ($0.00125/share-min) via set-terms (econ break-even 0.001242).
- 04:55 Pushed `claude/firm-quote`. Vercel preview `ubc-git-claude-firm-quote-avcool3s-projects.vercel.app` exists but is behind Vercel Authentication (SSO 302) → user must disable preview protection. Cannot verify deployed URL from sandbox.

- 05:20 Second review (docs/research/review-2.md): no critical; H1 early resolve → fixed (`ResolveBeforeClose`), H3 demo lockout → `HoldTooLarge` (100/hold) + restock to 857 available + faucet global budget, M1 reprice band ±$0.06, M2 rent disclosed, M3 limiter prunes, L1 expiry needs 5 misses. H2 (upgradeable) disclosed, left to user. Program upgraded in place on devnet. E2E bug fixed: no bundled releases in buys. Tests: 5 unit + 24 integration + full devnet E2E passing.

## Commands
- Local tests: start `solana-test-validator --reset`, deploy `target/deploy/held_quote.so`, then `NODE_OPTIONS=--no-experimental-strip-types ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-mocha -p ./tsconfig.json -t 1000000 --exit tests/held_quote.ts` (Node 22 type-stripping must be off for ts-mocha).
- Browser E2E: scratchpad e2e-held.js against `next start -p 3001` (NODE_USE_ENV_PROXY=1 for server fetches).

## Next action
- Done unless the user asks for more. User: disable Vercel preview protection, confirm Preview env vars, pick which product to submit, record video.

## Evidence paths
- docs/research/*.md (subagent reports), econ/ (harness, results, chart), contracts/tests, scratchpad screenshots.

- 10:51 Vercel env vars added for Preview (5 vars: RPC, cluster, demo mode, faucet key, maker key). Rebuilding preview to pick them up.
