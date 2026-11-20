# 90-second judge script (Held)

Setup before recording: open the trade page in a fresh browser, click **No wallet? Use a demo wallet**, then **Get $20 test USDC**. Set shares to 20.

**0:00 – 0:15 · The decision**
> "You want 20 YES on 'Will the Fed hike 25 bps in December?'. The app shows $0.93. Do you trust that price long enough to think? On a thin book — Gemini's real book here has only 25 contracts at the best ask — the price you see often isn't the price you get."
> *(Point at the dashed Gemini reference panel: "display only, not tradable here".)*

**0:15 – 0:35 · Two honest choices**
> "Buy now is all-or-nothing up to my max. Or I can hold this price for 30 seconds for a fee of about a cent — shown as a number, right on the button."
> *(Select Hold 30s → press Hold. The route shows Signed → Submitted → Confirmed.)*
> "It says 'Price held · not bought yet'. Not filled. My 20 shares are now reserved in program custody."

**0:35 – 0:55 · Value changes hands**
> *(Press "▲ Maker raises ask $0.03" — labelled demo simulation.)* "The maker just repriced to $0.96. My card says the hold is protecting me."
> *(Press "Buy 20 YES at $0.93".)* "I pay $18.60 and get 20 shares in the same transaction."

**0:55 – 1:15 · The one guarantee the chain enforces**
> *(Click "Verify receipt →".)* "This page needs no wallet. It re-reads the transaction and the Hold account from devnet: payment and shares moved together, the hold sits at its PDA, it's owned by the program, and the pool's custody adds up. Until expiry, those shares could only go to me at that price — the maker couldn't sell them, pull them, or 'last look'."

**1:15 – 1:30 · The measured trade-off, and what a venue would need**
> *(Evidence page.)* "We measured it: in calm markets buying now is cheaper, so it's our default; a fair hold is an option, not free money. Where it wins is fill certainty — thin books went from 1.6 to 0.4 unfilled shares per order. A real venue would need maker inventory in on-chain custody and a fee that scales with volatility. That's Held."
