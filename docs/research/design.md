# Order ticket design: buy now vs. price hold

Scope: one binary market, one buyer, Solana devnet. The **reference price** comes from Gemini Predictions and is for display only. The **executable price** comes from our test maker on Solana and is the price you can actually get. A hold is always labelled **"Price held"**, never "filled".

## 1. Three approaches

| | (a) Binding short-lived quote | (b) Receipt that explains confirmation | (c) Informed choice: buy now or priced hold |
|---|---|---|---|
| First action | Tap "Get quote for 20 YES". | Tap "Buy 20 YES" (max price pre-filled). | Pick a card: "Buy now" or "Hold this price (fee $0.05, 30s)". |
| What they get | One price, firm for about 15s. It is a display promise, not reserved on-chain. | A receipt that walks through Submitted → Confirmed → Finalized and links to the explorer. | Buy now: an atomic fill at or under the max, or nothing. Hold: shares reserved in program custody until the countdown ends. |
| Evidence that changes the next decision | The quote ages out ("Quote expired, get a new one"), so they learn that prices move. | The receipt's status and slot number show when it is safe to rely on the result. | The fee next to the gap between reference and executable price, plus "20 of 20 available". If the gap is large or liquidity is thin, holding buys time to decide. |
| Weakness | Binding only in the UI, so it can mislead. | Explains after the fact. | Two choices; mitigate by preselecting Buy now. |

**Recommendation: (c), with (b)'s receipt as the end state of both paths.** Only (c) changes the decision before money is spent. The hold is (a)'s binding quote, made real on-chain and priced honestly.

### 60-second demo scripts

**(a)** 0–10s: market and Gemini reference, display only. 10–25s: Get quote → $0.62, 15s ring. 25–40s: let it lapse ("Quote expired"). 40–60s: re-quote at $0.64, buy, show receipt.

**(b)** 0–15s: Buy 20 YES, max $0.65. 15–35s: receipt steps Submitted → Confirmed (slot) → Finalized. 35–60s: open the explorer; same signature and amount. "Anyone can verify this."

**(c)** 0–10s: point at the two prices, reference $0.60 (Gemini) and executable $0.62 (Solana). 10–25s: choose "Hold this price", sign, see "Price held · 0:30" and the custody note. 25–40s: exercise at 0:12 left; the receipt shows the fee and fill separately. 40–55s: run a second hold and let it expire; it reads "Hold expired. Fee kept, no shares bought." Then switch to Buy now with a max price that is too low: "Price moved above your max. Nothing was charged." 55–60s: verify both receipts on the explorer.

## 2. Land-book references

**Limitation.** land-book.com returns HTTP 403 to our sandbox, through both WebFetch and curl. The Wayback Machine was also unreachable. I found the listing URLs through web search results scoped to land-book.com and inspected the **live sites** they showcase. I could not view the Land-book screenshots themselves.

1. **Upstox**: https://land-book.com/websites/7346-upstox-online-share-stock-trading-options-trading-discount-brokers-in-india (live: upstox.com). A fee stat row ("₹20 Brokerage*") sits beside the single CTA, with consent text right under the button. **Lesson:** show the hold fee as a number inside the action zone, with no asterisk; Upstox's footnotes far below the fold are the anti-pattern.
2. **Fin.com**: https://land-book.com/websites/97118-fin-global-money-movement-fin-com (found via a feedbagel.com mirror). A route diagram shows a payment's hops, labelled with time ("Swift transfer: 2–5 days"). **Lesson:** render the receipt as a route of stages (Signed → Submitted → Confirmed → Finalized), each timestamped, not a spinner.
3. **Finofo (pricing)**: https://land-book.com/websites/72737-finofo-pricing (live: finofo.com/pricing). Price comes from an input-driven calculator; when it failed to load in our fetch, the page said "hasn't loaded" instead of showing a blank or zero. **Lesson:** recompute fee and total live as size changes, and label missing data explicitly, never a stale number as if current.

## 3. React Bits component

Registry items inspected (`https://reactbits.dev/r/<Name>-TS-TW.json`): CountUp and DecryptedText need `motion@^12`; AnimatedContent and FadeContent need `gsap@^3.13` + ScrollTrigger; **Counter needs nothing**. All five check reduced motion.

**Recommendation: Counter**, used for the hold countdown, with the seconds digits rolling down. It is an odometer-style number.
- URL: https://reactbits.dev/components/counter
- Install: `npx shadcn@latest add @react-bits/Counter-TS-TW`, which matches our Tailwind v4 + TS setup. Copy-paste source: https://reactbits.dev/r/Counter-TS-TW.json (file `Counter/Counter.tsx`). No jsrepo command is shown on the page.
- It needs no motion, framer-motion or gsap, so it adds no dependency to `frontend/package.json`.
- It already renders a visually hidden text label, marks the animated digit strip `aria-hidden="true"`, and checks `matchMedia('(prefers-reduced-motion: reduce)')`.

Usage: `<Counter value={secondsLeft} minDigits={2} tabular prefix="0:" />`, driven by on-chain expiry minus cluster time, not a local timer alone.

- **Keyboard:** the countdown is not focusable. The focusable "Buy 20 YES at $0.62" (Exercise) button sits right after it, and its accessible name includes the time: `aria-describedby` points to "Held until 14:03:22". Esc does not cancel a hold, because a hold cannot be cancelled; the fee is already paid.
- **Reduced motion:** the digits swap instantly with no roll and no blur, and the progress ring becomes a static text bar. The final 10s get no pulse and no colour flashing; only the text changes to "10 seconds left".
- **Receipt reveal:** plain CSS (opacity + 8px slide, 150ms), off under reduced motion. Not worth adding gsap.

## 4. Wireframes

**Mobile, 390px** (all of this is above the fold on an 844px-tall screen):
```
┌──────────────────────────────────┐
│ ● Devnet         [Connect wallet]│
│ Will X happen by Dec 31?         │
│──────────────────────────────────│
│ YOU CAN BUY NOW (Solana)         │
│ 20 YES  @ $0.62  = $12.40        │
│ 20 of 20 available               │
│ ┄ Reference: $0.60 · Gemini ┄    │
│ ┄ display only · 4s ago     ┄    │
│──────────────────────────────────│
│ ◉ Buy now   max $0.65 [edit]     │
│   Fills at ≤$0.65 or not at all  │
│ ○ Hold $0.62 for 30s · fee $0.05 │
│   Shares reserved; decide later  │
│ ┌──────────────────────────────┐ │
│ │   Buy 20 YES · up to $13.00  │ │
│ └──────────────────────────────┘ │
│ Status: Ready.  (aria-live)      │
└──────────────────────────────────┘
After a hold, the same card shows:
│ PRICE HELD  0:24  ▓▓▓▓▓▓░░       │
│ 20 YES @ $0.62 · fee $0.05 paid  │
│ [ Buy 20 YES at $0.62 ]          │
│  Let it expire (no action)       │
```

**Desktop, 1440px** (12-column grid; ticket in columns 8–12, market in columns 1–7):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Logo                                         ● Devnet   [Wallet 7xQ…f3]   │
├───────────────────────────────────────────┬─────────────────────────────────┤
│ Will X happen by Dec 31?                  │ ORDER TICKET                    │
│                                           │ Executable (Solana maker)       │
│ Reference price (Gemini, display only)    │  20 YES @ $0.62 = $12.40        │
│  $0.60   updated 4s ago   ┄┄ sparkline ┄  │  20 of 20 available             │
│  ⓘ Not a price you can trade at.          │ Gap vs reference: +$0.02        │
│                                           │ ┌─────────────┬───────────────┐ │
│ Receipt route (after an action):          │ │◉ Buy now    │○ Hold 30s     │ │
│ Signed ─ Submitted ─ Confirmed ─ Final    │ │ max $0.65   │ fee $0.05     │ │
│  14:02:51  14:02:52   slot 3123…   …      │ │ all or none │ shares held   │ │
│ [View on explorer ↗]  [Copy signature]    │ └─────────────┴───────────────┘ │
│                                           │ [  Buy 20 YES · up to $13.00  ] │
│                                           │ Status: Ready.                  │
└───────────────────────────────────────────┴─────────────────────────────────┘
```
Reference: dashed border, muted, "display only" tag. Executable: solid border, full contrast, larger. Never the same size.

## 5. Copy for every state

| State | Copy |
|---|---|
| Wallet not connected | "Connect a wallet to buy. Prices shown are live." Button: **Connect wallet** |
| Wallet rejection | "You cancelled in your wallet. Nothing was sent." |
| Submitting | "Waiting for your wallet to sign…" |
| Pending | "Sent. Waiting for the network to confirm. This usually takes a few seconds." |
| Confirmed | "Confirmed. 20 YES bought at $0.62. Final in a few seconds." |
| Finalized | "Final. This can't be reversed. Receipt below." |
| Price held | "Price held: 20 YES at $0.62. 0:24 left. Fee $0.05 paid. You haven't bought yet." |
| Hold expired | "Hold expired. Your $0.05 fee is kept. No shares were bought." Button: **See current price** |
| Missing liquidity | "Only 12 of 20 shares are available at this price. Buy 12, or lower your size." |
| Price moved beyond max | "Price moved above your max of $0.65. Nothing was bought and nothing was charged except the network fee." |
| Stale reference | "Reference price is 2 min old. It may be out of date. Your buy uses the Solana price, which is live." |
| RPC interruption / unknown | "We lost contact with the network. We don't know yet if this went through. Don't buy again. We're checking." After the check: "Still unknown. Check signature 5Kx…9a on the explorer before trying again." |
| Receipt | "Receipt · Buy now · 20 YES · $0.62 each · $12.40 total · Final · Signature 5Kx…9a · Slot 3123… · [Verify on explorer]". For a hold: "Price held, then exercised" or "Price held, expired". The fee is shown as its own line. |

Rule: the unknown state uses a neutral "?" icon, never a check or a cross, and keeps the signature visible.

## 6. Accessibility

- **aria-live:** use one `role="status" aria-live="polite"` region under the primary button for every state change. Use `role="alert"` (assertive) only for the wallet-rejection, price-moved and unknown states. The countdown announces at 30s, 10s and "Hold expired", never every second. The Counter's digits stay `aria-hidden`.
- **Focus order:** market question (h1) → executable price → reference price → choice radios (one radio group, arrow keys move between them) → max price or size edit → primary button → status → receipt links. After an action completes, move focus to the receipt heading ("Receipt, final"). After a failure, focus stays on the primary button.
- **Contrast (dark theme):** background `#0B0F14`, text `#E6EDF3` (16.3:1). Muted reference text `#9AA7B4` (7.8:1); the reference is muted but never below 4.5:1. Accent and button `#4F9CF9` with dark text `#0B0F14` (6.8:1). Status colours: amber `#F5B94A` (10.9:1) for held/pending, red `#FF7B72` and green `#3FB950` (7.6:1 each). Every status also carries an icon and a word, never colour alone. Focus ring: 2px `#FFFFFF` plus a 2px offset.
- **Reduced motion:** no digit roll, slide, pulse or sparkline animation; every state reads as static text.
- **Targets:** ≥44×44px; prices use `tabular-nums`.
