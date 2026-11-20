"use client";
/**
 * The order ticket — the whole product in one card.
 *
 * Two explicit choices for buying YES shares from the test maker's pool:
 *   ◉ Buy now   all-or-nothing at the current ask, up to your max price
 *   ○ Hold      pay a disclosed fee; the current ask is frozen for you for N
 *               seconds (shares reserved in program custody); then buy at that
 *               price or let it expire
 *
 * Rules this component follows:
 *  - Executable numbers come ONLY from chain state (pool account).
 *  - While the wallet is signing, the numbers shown are a frozen snapshot of
 *    what the user agreed to, not live values that might move under them.
 *  - A hold is labelled "Price held", never "filled".
 *  - After a refresh, a pending transaction keeps being watched, and holds are
 *    re-read from chain, so nothing is forgotten.
 */
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { PublicKey, Transaction } from "@solana/web3.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { buyNowTx, exerciseTx, holdTx, releaseTx } from "@/lib/actions";
import { explorerAddress, PRICE_TICK } from "@/lib/contracts";
import { callDemo, DEMO_MODE } from "@/lib/demo";
import { DemoWalletName } from "@/lib/demoWallet";
import { friendlyError } from "@/lib/errors";
import { ago, holdFee, usd, usdFee } from "@/lib/format";
import { announceChainChange, useBalances, useChainNow, useMyHolds, useVenue } from "@/lib/hooks";
import { useHeldProgram } from "@/lib/program";
import { readPending, sendTransaction, watchSignature, type TxUpdate } from "@/lib/send";
import { holdStatus } from "@/lib/types";
import { HoldCountdown } from "./HoldCountdown";
import { TxRoute } from "./TxRoute";
import { Button } from "./ui";

type Mode = "now" | "hold";
const HOLD_CHOICES = [15, 30, 60];
const MIN_SOL_LAMPORTS = 5_000_000; // ~0.005 SOL for fees + a hold account's rent

export function Ticket() {
  const { connection } = useConnection();
  const { program, wallet } = useHeldProgram();
  const { select } = useWallet();
  const { setVisible } = useWalletModal();
  const venue = useVenue(program);
  const v = venue.data;
  const buyer = wallet?.publicKey ?? null;
  const holds = useMyHolds(program, buyer);
  const balances = useBalances(buyer, v?.marketData.yesMint ?? null);
  const chainNow = useChainNow();

  const [qty, setQty] = useState(20);
  const [mode, setMode] = useState<Mode>("now");
  const [holdSecs, setHoldSecs] = useState(30);
  const [maxPrice, setMaxPrice] = useState<number | null>(null); // null = follow the live ask
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<TxUpdate[]>([]);
  const [frozen, setFrozen] = useState<null | { ask: number; qty: number; fee: number; secs: number; mode: Mode }>(null);
  const resumed = useRef(false);

  const ask = v?.poolData.ask.toNumber() ?? 0;
  const available = v?.poolData.available.toNumber() ?? 0;
  const effectiveMax = maxPrice ?? ask;
  const fee = v ? holdFee(v.poolData.holdRate.toNumber(), qty, holdSecs) : 0;
  const maxHold = v?.poolData.maxHoldSecs ?? 60;
  const marketOpen = !!v && "open" in v.marketData.status && chainNow < v.marketData.closeTime.toNumber();

  // ---- Holds: the newest active one, plus expired ones anyone may release ----
  const myHolds = holds.data ?? [];
  const activeHold = myHolds.find((h) => holdStatus(h.account) === "held" && h.account.expiresAt.toNumber() > chainNow);
  const expiredHeld = myHolds.filter((h) => holdStatus(h.account) === "held" && h.account.expiresAt.toNumber() <= chainNow);
  const lastSettled = myHolds.find((h) => holdStatus(h.account) !== "held");

  // ---- Resume a transaction that was in flight when the page was refreshed ----
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const pending = readPending();
    if (!pending) return;
    setHistory([{ stage: "submitted", label: pending.label, signature: pending.signature, at: pending.at }]);
    void watchSignature(connection, pending, (u) => {
      setHistory((h) => [...h, u]);
      if (u.stage === "confirmed" || u.stage === "finalized" || u.stage === "failed") announceChainChange();
    });
  }, [connection]);

  /** Simulate → sign → submit → watch, with every stage shown. */
  async function run(label: string, build: () => Promise<Transaction>) {
    if (!wallet) return setVisible(true);
    setBusy(true);
    setHistory([]);
    try {
      const tx = await build();
      await sendTransaction(connection, wallet, tx, label, (u) => {
        setHistory((h) => [...h, u]);
        if (u.stage === "confirmed" || u.stage === "finalized" || u.stage === "failed") announceChainChange();
      });
    } catch (e) {
      setHistory((h) => [...h, { stage: "failed", label, at: Date.now(), error: friendlyError(e) }]);
    } finally {
      setBusy(false);
      setFrozen(null);
    }
  }

  const expiredKeys = (): PublicKey[] => expiredHeld.map((h) => h.publicKey);

  function buyNow() {
    if (!v || !buyer) return setVisible(true);
    setFrozen({ ask, qty, fee: 0, secs: 0, mode: "now" });
    const label = `${qty} YES bought at up to ${usd(effectiveMax)}`;
    void run(label, () => buyNowTx(program, v, buyer, qty, effectiveMax, expiredKeys()));
  }

  function hold() {
    if (!v || !buyer) return setVisible(true);
    setFrozen({ ask, qty, fee, secs: holdSecs, mode: "hold" });
    const label = `Price held: ${qty} YES at ${usd(ask)} for ${holdSecs}s (fee ${usdFee(fee)})`;
    // max_price = the ask you saw, max_fee = the fee you saw: if either moved, nothing is charged.
    void run(label, async () => (await holdTx(program, v, buyer, qty, holdSecs, ask, fee, expiredKeys())).tx);
  }

  function exercise() {
    if (!v || !buyer || !activeHold) return;
    const h = activeHold.account;
    const label = `${h.qty.toNumber()} YES bought at your held ${usd(h.price)}`;
    void run(label, () => exerciseTx(program, v, buyer, activeHold.publicKey));
  }

  function release(holdKey: PublicKey) {
    if (!v || !buyer) return;
    void run("Expired hold released back to the pool", () => releaseTx(program, v, buyer, holdKey));
  }

  async function faucet() {
    if (!buyer) return;
    setBusy(true);
    setHistory([{ stage: "submitted", label: "Adding $20 test USDC", at: Date.now() }]);
    try {
      const sig = await callDemo("faucet", { wallet: buyer.toBase58() });
      setHistory((h) => [...h, { stage: "confirmed", label: "$20 test USDC added", signature: sig, at: Date.now() }]);
      announceChainChange();
    } catch (e) {
      setHistory((h) => [...h, { stage: "failed", label: "Faucet", at: Date.now(), error: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  async function reprice(direction: "up" | "down") {
    setBusy(true);
    setHistory([{ stage: "submitted", label: `Simulated: maker moves ask ${direction}`, at: Date.now() }]);
    try {
      const sig = await callDemo("reprice", { direction });
      setHistory((h) => [...h, { stage: "confirmed", label: `Simulated maker reprice (${direction === "up" ? "+" : "−"}$0.03)`, signature: sig, at: Date.now() }]);
      announceChainChange();
    } catch (e) {
      setHistory((h) => [...h, { stage: "failed", label: "Reprice", at: Date.now(), error: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  // ---- Readiness checks, in plain language ----
  const usdc = balances.data?.usdc ?? 0;
  const sol = balances.data?.sol ?? 0;
  const needUsdc = mode === "now" ? effectiveMax * qty : fee;
  const shortOnFunds = !!buyer && balances.data !== null && (usdc < needUsdc || sol < MIN_SOL_LAMPORTS);
  const notEnoughShares = qty > available;

  const shown = frozen ?? { ask, qty, fee, secs: holdSecs, mode };
  const totalNow = shown.ask * shown.qty;

  const primary = useMemo(() => {
    if (!buyer) return { text: "Connect wallet", onClick: () => setVisible(true), disabled: false };
    if (!marketOpen) return { text: "Trading closed", onClick: () => {}, disabled: true };
    if (balances.data === null) return { text: "Checking your balance…", onClick: () => {}, disabled: true };
    if (notEnoughShares) return { text: `Only ${available} available`, onClick: () => {}, disabled: true };
    if (mode === "now")
      return { text: `Buy ${qty} YES · up to ${usd(effectiveMax * qty)}`, onClick: buyNow, disabled: busy || shortOnFunds };
    return { text: `Hold ${usd(ask)} for ${holdSecs}s · fee ${usdFee(fee)}`, onClick: hold, disabled: busy || shortOnFunds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyer, marketOpen, balances.data, notEnoughShares, mode, qty, effectiveMax, busy, shortOnFunds, ask, holdSecs, fee, available]);

  if (venue.loading && !v) return <div className="rounded-3xl border border-line bg-surface p-6 text-muted">Reading the market from Solana…</div>;
  if (!v) return <div className="rounded-3xl border border-bad/40 bg-surface p-6 text-bad">Couldn&apos;t read the market from Solana. {venue.error}</div>;

  return (
    <section aria-label="Order ticket" className="rounded-3xl border border-line bg-surface p-5 shadow-xl shadow-black/30">
      {/* ---- Executable price (solid, full contrast, larger than the reference) ---- */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">You can buy now · Solana devnet</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            {usd(shown.ask)} <span className="text-base font-semibold text-muted">per YES</span>
          </p>
          <p className="text-sm text-muted">
            {available} of {available + v.poolData.reserved.toNumber()} shares free · {v.poolData.reserved.toNumber()} held by others
          </p>
        </div>
        <p className="text-right text-[11px] text-muted">
          Test maker&apos;s ask
          <br />
          terms #{v.poolData.termsSeq.toString()} · read {ago((Date.now() - v.readAt) / 1000)}
        </p>
      </div>
      {venue.error && (
        <p className="mt-2 rounded-xl bg-warn/10 p-2 text-xs text-warn" role="status">
          Couldn&apos;t refresh from the network. Showing chain data from {ago((Date.now() - v.readAt) / 1000)}.
        </p>
      )}

      {activeHold ? (
        // ---------------- A price is held ----------------
        <div className="mt-4 rounded-2xl border border-accent/50 bg-accent-strong/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Price held · not bought yet</p>
          <p className="mt-1 text-lg font-bold">
            {activeHold.account.qty.toNumber()} YES at {usd(activeHold.account.price)}{" "}
            <span className="text-sm font-normal text-muted">· fee {usdFee(activeHold.account.feePaid.toNumber())} paid</span>
          </p>
          <div className="mt-2">
            <HoldCountdown
              secondsLeft={activeHold.account.expiresAt.toNumber() - chainNow}
              total={activeHold.account.expiresAt.toNumber() - activeHold.account.createdAt.toNumber()}
            />
          </div>
          {ask !== activeHold.account.price.toNumber() && (
            <p className="mt-2 text-sm">
              Market ask is now <b>{usd(ask)}</b>. Your held price is <b>{usd(activeHold.account.price)}</b>{" "}
              {ask > activeHold.account.price.toNumber() ? "— the hold is protecting you." : "— buying now would be cheaper; you can let the hold expire."}
            </p>
          )}
          <Button
            className="mt-3 w-full py-3 text-base"
            onClick={exercise}
            disabled={busy || activeHold.account.expiresAt.toNumber() - chainNow < 1.5}
          >
            {activeHold.account.expiresAt.toNumber() - chainNow < 1.5
              ? "Expiring…"
              : `Buy ${activeHold.account.qty.toNumber()} YES at ${usd(activeHold.account.price)} (${usd(activeHold.account.price.toNumber() * activeHold.account.qty.toNumber())})`}
          </Button>
          <p className="mt-2 text-xs text-muted">
            Or do nothing: at 0:00 the hold expires, the shares go back to the pool, and the fee is kept by the maker. Expiry is decided by the
            chain&apos;s clock, so the last second is not guaranteed.
          </p>
        </div>
      ) : (
        // ---------------- Choose: buy now or hold ----------------
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Shares</span>
            <span className="flex items-center gap-1">
              <button className="h-9 w-9 rounded-full border border-line" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One fewer share" disabled={busy}>
                −
              </button>
              <input
                className="h-9 w-16 rounded-xl border border-line bg-bg text-center tabular-nums"
                inputMode="numeric"
                aria-label="Number of YES shares"
                value={qty}
                disabled={busy}
                onChange={(e) => setQty(Math.max(1, Math.min(500, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1))))}
              />
              <button className="h-9 w-9 rounded-full border border-line" onClick={() => setQty((q) => Math.min(500, q + 1))} aria-label="One more share" disabled={busy}>
                +
              </button>
            </span>
          </label>

          <fieldset className="grid gap-2 sm:grid-cols-2" disabled={busy}>
            <legend className="sr-only">How do you want to buy?</legend>
            <label className={`cursor-pointer rounded-2xl border p-3 ${mode === "now" ? "border-accent bg-accent-strong/10" : "border-line"}`}>
              <input type="radio" name="mode" className="sr-only" checked={mode === "now"} onChange={() => setMode("now")} />
              <span className="font-semibold">◉ Buy now</span>
              <span className="mt-1 block text-xs text-muted">All or nothing, up to your max. No fee.</span>
              <span className="mt-2 flex items-center gap-1 text-xs">
                Max{" "}
                <button type="button" className="rounded-full border border-line px-2" aria-label="Lower max price by one cent" onClick={() => setMaxPrice(Math.max(PRICE_TICK, effectiveMax - PRICE_TICK))}>
                  −
                </button>
                <b className="tabular-nums">{usd(effectiveMax)}</b>
                <button type="button" className="rounded-full border border-line px-2" aria-label="Raise max price by one cent" onClick={() => setMaxPrice(Math.min(990_000, effectiveMax + PRICE_TICK))}>
                  +
                </button>
                {maxPrice !== null && (
                  <button type="button" className="text-accent underline" onClick={() => setMaxPrice(null)}>
                    reset
                  </button>
                )}
              </span>
            </label>
            <label className={`cursor-pointer rounded-2xl border p-3 ${mode === "hold" ? "border-accent bg-accent-strong/10" : "border-line"}`}>
              <input type="radio" name="mode" className="sr-only" checked={mode === "hold"} onChange={() => setMode("hold")} />
              <span className="font-semibold">○ Hold this price</span>
              <span className="mt-1 block text-xs text-muted">Shares reserved for you in program custody. Decide later.</span>
              <span className="mt-2 flex flex-wrap items-center gap-1 text-xs" role="group" aria-label="Hold length">
                {HOLD_CHOICES.filter((s) => s <= maxHold).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={holdSecs === s}
                    className={`rounded-full border px-2 py-0.5 ${holdSecs === s ? "border-accent text-ink" : "border-line text-muted"}`}
                    onClick={() => {
                      setMode("hold");
                      setHoldSecs(s);
                    }}
                  >
                    {s}s
                  </button>
                ))}
                <span className="ml-1">
                  fee <b className="tabular-nums">{usdFee(fee)}</b>
                </span>
              </span>
            </label>
          </fieldset>

          {/* The fee as a number inside the action area, no asterisk (design lesson from Upstox). */}
          <div className="rounded-xl bg-bg/60 p-3 text-sm tabular-nums">
            {shown.mode === "now" ? (
              <>
                You pay at most <b>{usd(effectiveMax * shown.qty)}</b> for {shown.qty} YES. At the current ask: <b>{usd(totalNow)}</b>. If the price moves above
                your max, nothing happens and nothing is charged except the network fee.
              </>
            ) : (
              <>
                Now: fee <b>{usdFee(shown.fee)}</b> (kept by the maker either way). Later, if you buy: <b>{usd(totalNow)}</b> for {shown.qty} YES at{" "}
                {usd(shown.ask)}, any time in the next {shown.secs}s.
              </>
            )}
          </div>
          {notEnoughShares && (
            <p className="text-sm text-warn">
              Only {available} of {qty} shares are available.{" "}
              {available > 0 && (
                <button className="text-accent underline" onClick={() => setQty(available)}>
                  Use {available}
                </button>
              )}
            </p>
          )}
          <Button className="w-full py-3 text-base" onClick={primary.onClick} disabled={primary.disabled} loading={busy}>
            {primary.text}
          </Button>
          {!buyer && DEMO_MODE && (
            <button className="w-full text-center text-sm text-accent underline" onClick={() => select(DemoWalletName)}>
              No wallet? Use a demo wallet (devnet, no install)
            </button>
          )}
        </div>
      )}

      {/* ---- Funds ---- */}
      {buyer && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            You: {usd(usdc)} test USDC · {balances.data?.yes ?? 0} YES · {((balances.data?.sol ?? 0) / 1e9).toFixed(3)} SOL
          </span>
          {shortOnFunds && DEMO_MODE && (
            <Button variant="secondary" onClick={faucet} disabled={busy}>
              Get $20 test USDC
            </Button>
          )}
          {shortOnFunds && !DEMO_MODE && <span className="text-warn">Not enough test USDC or SOL for this.</span>}
        </div>
      )}

      {/* ---- Status of the latest action ---- */}
      {history.length > 0 && (
        <div className="mt-3">
          <TxRoute history={history} />
        </div>
      )}

      {/* ---- Expired holds: show, and let anyone clean up ---- */}
      {expiredHeld.length > 0 && !activeHold && (
        <div className="mt-3 rounded-xl border border-line p-3 text-sm" role="status">
          Hold expired. Your {usdFee(expiredHeld[0].account.feePaid.toNumber())} fee is kept. No shares were bought.{" "}
          <button className="text-accent underline" onClick={() => release(expiredHeld[0].publicKey)} disabled={busy}>
            Return the shares to the pool
          </button>{" "}
          <span className="text-muted">(anyone may do this; it moves nothing to you or the caller).</span>
        </div>
      )}
      {lastSettled && !activeHold && history.length === 0 && (
        <p className="mt-3 text-xs text-muted">
          Your last hold was {holdStatus(lastSettled.account)} {ago(chainNow - lastSettled.account.settledAt.toNumber())}.{" "}
          <a className="text-accent underline" href={explorerAddress(lastSettled.publicKey.toBase58())} target="_blank" rel="noreferrer">
            See its on-chain record ↗
          </a>
        </p>
      )}

      {/* ---- Demo-only simulation, clearly labelled ---- */}
      {DEMO_MODE && (
        <div className="mt-4 rounded-xl border border-dashed border-warn/40 p-3 text-xs text-muted">
          <p className="font-semibold text-warn">Demo simulation · not market behaviour</p>
          <p className="mt-1">Make the test maker reprice (a real devnet transaction signed by the maker) to see what a hold protects.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => reprice("up")} disabled={busy}>
              ▲ Maker raises ask $0.03
            </Button>
            <Button variant="secondary" onClick={() => reprice("down")} disabled={busy}>
              ▼ Lowers $0.03
            </Button>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {/* State only, not every second: a ticking announcement would drown out everything else. */}
        {activeHold ? `Price held: ${activeHold.account.qty.toNumber()} YES at ${usd(activeHold.account.price)}. You haven't bought yet.` : ""}
      </p>
    </section>
  );
}
