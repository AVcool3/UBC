#!/usr/bin/env python3
"""Replay/simulation harness: indicative+atomic buy (A), truthful labels (B), priced hold (C).

ALL PRICE PATHS ARE SEEDED SYNTHETIC (random walk in logit-probability space, 1 s steps,
with Poisson jumps). They are NOT calibrated to any venue. Nothing here fits a "ghost
probability" or infers quote volatility from real data.

Units (kept distinct everywhere):
  * prices: integer micro-dollars per share (1 USD = 1_000_000), tick = 10_000 ($0.01)
  * order-level money: micro-dollars per order (reported as $/order)
  * probability moves: probability points (pp, 1 pp = $0.01/share on a $1 binary)
  * hold rate: micro-dollars per share-minute (reported as $/share-min)

Mechanism follows RUNLOG.md "Frozen mechanism spec":
  fee = ceil(rate * q * H / 60); exercise requires D < H (strict); release at >= expiry.

Lookahead: every decision reads the book through `Observer`, which raises if a decision at
time `now` reads any t > now. Decision latency D and abandonment are drawn independently of
the path (exogenous), so the user's choice at t0 uses only information at or before t0.

CLI:  python3 econ/harness.py            (full run, writes results.json + chart)
      python3 econ/harness.py --quick    (small N smoke run)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import zlib
from dataclasses import dataclass, asdict, replace

import numpy as np

MICRO = 1_000_000
TICK = 10_000
PRICE_MAX = 990_000  # highest ask level allowed (< $1)
LAMPORTS_PER_SIG = 5_000  # Solana base fee per signature (devnet == mainnet base fee)
SOL_USD_ASSUMPTION = 150.0  # explicit assumption; devnet SOL itself is worthless
SIG_COST_MICRO = LAMPORTS_PER_SIG / 1e9 * SOL_USD_ASSUMPTION * MICRO  # = 750 micro$ = $0.00075

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


# --------------------------------------------------------------------------------------
# Core arithmetic (shared with the unit-test fixture)
# --------------------------------------------------------------------------------------
def hold_fee_micro(rate_micro_per_share_min, q, hold_secs):
    """fee = ceil(rate * q * H / 60) in integer micro-dollars (matches on-chain formula)."""
    num = np.asarray(rate_micro_per_share_min, dtype=np.int64) * np.asarray(q, dtype=np.int64) \
        * np.asarray(hold_secs, dtype=np.int64)
    return (num + 59) // 60


def walk_cost(ask, level_size, n_levels, q, tick=TICK):
    """Walk a uniform ladder: n_levels levels of `level_size` shares at ask, ask+tick, ...

    Returns (cost_micro, filled_shares, marginal_price_micro). Vectorised over arrays.
    Partial fills are allowed here; atomic all-or-nothing is decided by the caller.
    """
    ask = np.asarray(ask, dtype=np.int64)
    s = np.asarray(level_size, dtype=np.int64)
    q = np.asarray(q, dtype=np.int64)
    depth = s * n_levels
    filled = np.minimum(q, depth)
    s_safe = np.where(s > 0, s, 1)
    n_full = np.where(s > 0, filled // s_safe, 0)
    rem = np.where(s > 0, filled % s_safe, 0)
    cost = s * (n_full * ask + tick * n_full * (n_full - 1) // 2) + rem * (ask + n_full * tick)
    n_used = np.where(s > 0, -(-filled // s_safe), 0)
    marginal = ask + np.maximum(n_used - 1, 0) * tick
    return cost, filled, marginal


def book_cost_levels(levels, q):
    """Walk an explicit book [(price_micro, qty), ...] sorted ascending. Returns (cost, filled)."""
    cost, filled = 0, 0
    for px, qty in levels:
        take = min(qty, q - filled)
        cost += take * px
        filled += take
        if filled == q:
            break
    return cost, filled


def gross_protection_micro(q, held_price, replacement_price):
    """Stylized gross benefit of a buyer-held quote: q * max(replacement - held, 0).
    NOT a fair option premium and NOT a venue loss estimate."""
    return q * max(replacement_price - held_price, 0)


def binding_regret_micro(q, binding_price, later_price):
    """How much worse a BINDING purchase at binding_price is than waiting and paying
    later_price (positive = binding purchase was worse)."""
    return q * max(binding_price - later_price, 0)


# --------------------------------------------------------------------------------------
# Synthetic path generation
# --------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Regime:
    name: str
    sigma: float          # logit-space diffusion per sqrt(second)
    jump_rate: float      # jumps per second
    jump_sd: float        # logit-space jump s.d.
    spread_ticks: int     # maker ask = ceil_tick(mid + spread/2)
    level_size: int       # shares per ladder level (available inventory)
    n_levels: int
    thin: bool = False    # depth-disappearing episodes
    deplete_enter: float = 1 / 90   # per-second prob. normal -> depleted
    deplete_exit: float = 1 / 25    # per-second prob. depleted -> normal
    deplete_size: int = 0           # shares per level while depleted


REGIMES = {
    "placid": Regime("placid", sigma=0.0008, jump_rate=0.0, jump_sd=0.0,
                     spread_ticks=2, level_size=50, n_levels=5),
    "normal": Regime("normal", sigma=0.004, jump_rate=1 / 600, jump_sd=0.15,
                     spread_ticks=2, level_size=50, n_levels=5),
    "volatile": Regime("volatile", sigma=0.012, jump_rate=1 / 120, jump_sd=0.30,
                       spread_ticks=2, level_size=50, n_levels=5),
    "thin": Regime("thin", sigma=0.004, jump_rate=1 / 600, jump_sd=0.15,
                   spread_ticks=4, level_size=8, n_levels=3, thin=True),
}


@dataclass(frozen=True)
class Behaviour:
    d_median: float = 20.0      # decision latency D ~ lognormal(median, d_sigma), seconds
    d_sigma: float = 1.0
    d_cap: int = 300
    retry_latency: int = 5      # extra seconds to re-sign/resubmit after a miss
    tolerance_ticks: int = 0    # A: limit = a0 + tolerance
    p_abandon: float = 0.15
    q_choices: tuple = (5, 10, 20, 40)


@dataclass(frozen=True)
class MakerAssumption:
    turnover_per_sec: float = 1 / 600   # locked shares would otherwise sell at this rate...
    # ...earning half the spread per share (explicit opportunity-cost assumption)


T0 = 120  # warm-up seconds before the user arrives (history exists, never read after t0)


def seed_for(*parts):
    return zlib.crc32("|".join(str(p) for p in parts).encode())


def gen_paths(reg: Regime, n, horizon, seed):
    """Returns ask[n,T] (micro$), level_size[n,T] (shares), mid[n,T] (prob)."""
    rng = np.random.default_rng(seed)
    T = horizon
    x0 = np.log(p0 := rng.uniform(0.15, 0.85, n)) - np.log1p(-p0)
    inc = reg.sigma * rng.standard_normal((n, T))
    if reg.jump_rate > 0:
        jumps = rng.random((n, T)) < reg.jump_rate
        inc += jumps * reg.jump_sd * rng.standard_normal((n, T))
    inc[:, 0] = 0.0
    x = np.clip(x0[:, None] + np.cumsum(inc, axis=1), -3.0, 3.0)
    mid = 1.0 / (1.0 + np.exp(-x))
    half = reg.spread_ticks * TICK / 2
    ask = np.ceil((mid * MICRO + half) / TICK).astype(np.int64) * TICK
    ask = np.clip(ask, TICK, PRICE_MAX - (reg.n_levels - 1) * TICK)
    size = np.full((n, T), reg.level_size, dtype=np.int64)
    if reg.thin:
        state = np.zeros(n, dtype=bool)
        u = rng.random((n, T))
        for t in range(T):
            state = np.where(state, u[:, t] >= reg.deplete_exit, u[:, t] < reg.deplete_enter)
            size[state, t] = reg.deplete_size
    return ask, size, mid


class LookaheadError(RuntimeError):
    pass


class Observer:
    """Read-only view of the book that refuses to reveal the future."""

    def __init__(self, ask, size):
        self._ask, self._size = ask, size
        self._rows = np.arange(ask.shape[0])

    def book(self, t, now):
        t = np.asarray(t)
        if np.any(t > np.asarray(now)):
            raise LookaheadError("decision tried to read the book after its decision time")
        return self._ask[self._rows, t], self._size[self._rows, t]


# --------------------------------------------------------------------------------------
# Mechanisms on identical inputs
# --------------------------------------------------------------------------------------
def simulate(reg: Regime, beh: Behaviour, H: int, rate_micro: int, n: int, seed: int,
             maker: MakerAssumption = MakerAssumption()):
    rng = np.random.default_rng(seed + 1)
    horizon = T0 + beh.d_cap + beh.retry_latency + max(H, 1) + 2
    ask, size, mid = gen_paths(reg, n, horizon, seed)
    obs = Observer(ask, size)
    nl = reg.n_levels

    # exogenous draws (independent of the path => no lookahead through D or abandonment)
    D = np.clip(np.round(beh.d_median * np.exp(beh.d_sigma * rng.standard_normal(n))),
                1, beh.d_cap).astype(np.int64)
    abandon = rng.random(n) < beh.p_abandon
    q_req = rng.choice(np.array(beh.q_choices), n)

    t0 = np.full(n, T0)
    a0, s0 = obs.book(t0, now=t0)
    cost0, q, marg0 = walk_cost(a0, s0, nl, q_req)   # size-aware quote shown at t0
    quoted = q > 0
    qs = np.where(quoted, q, 1)
    avg0 = cost0 / qs                                   # $/share benchmark (micro)
    limit = marg0 + beh.tolerance_ticks * TICK

    tD = t0 + D
    aD, sD = obs.book(tD, now=tD)
    costD, fillD, margD = walk_cost(aD, sD, nl, q)
    hit = (fillD == q) & (margD <= limit)              # atomic buy_now(q, limit) succeeds

    tR = tD + beh.retry_latency
    aR, sR = obs.book(tR, now=tR)
    costR, fillR, _ = walk_cost(aR, sR, nl, q)          # market replacement, walks depth

    # ---- Mechanism A (and B: labels only, identical economics) ----
    A_cost = np.where(hit, costD, costR)
    A_fill = np.where(hit, q, fillR)
    A_sigs = np.where(hit, 1, 2)
    A_cost = np.where(abandon, 0, A_cost)
    A_fill = np.where(abandon, 0, A_fill)
    A_sigs = np.where(abandon, 0, A_sigs)
    replaced = ~hit & ~abandon
    repl_signed = np.where(replaced, costR - np.round(avg0 * fillR).astype(np.int64), 0)
    A_slip = A_cost - np.round(avg0 * A_fill).astype(np.int64)   # vs t0 executable cost

    # ---- Mechanism C: explicitly priced hold ----
    fee = hold_fee_micro(rate_micro, q, H)
    live = (D < H) & ~abandon                            # exercise needs now < expires_at
    expired = (D >= H) & ~abandon
    mkt_cheaper = (fillD == q) & (costD < cost0)         # rational: don't exercise if cheaper
    exercised = live & ~mkt_cheaper
    C_cost = np.where(live, np.where(mkt_cheaper, costD, cost0), A_cost)
    C_cost = np.where(abandon, 0, C_cost)
    C_fill = np.where(live, q, A_fill)
    C_fill = np.where(abandon, 0, C_fill)
    C_sigs = 1 + np.where(live, 1, np.where(expired, A_sigs, 0))
    C_slip = C_cost - np.round(avg0 * C_fill).astype(np.int64) + fee

    sig = SIG_COST_MICRO
    buyer_adv_C = (A_slip + A_sigs * sig) - (C_slip + C_sigs * sig)   # >0: C better for buyer

    # gross protection at use (exercised holds) and at expiry (needed, non-abandoned)
    gross_use = np.where(live, np.maximum(costD - cost0, 0), 0)
    gross_use = np.where(live & (fillD < q), np.maximum(q * (aD - a0), 0), gross_use)
    tH = t0 + H
    aH, sH = obs.book(tH, now=tH)
    gross_exp = np.where(~abandon, q * np.maximum(aH - a0, 0), 0)

    # ---- maker side ----
    payout = np.where(exercised, q * np.maximum(aD - a0, 0), 0)   # option payout (spec formula)
    lock = q * np.where(live, D, H)                                 # share-seconds reserved
    release_sig = np.where(live, 0, sig)                            # maker cranks release()
    opp = lock * maker.turnover_per_sec * (reg.spread_ticks * TICK / 2)
    maker_net = fee - payout - release_sig - opp

    # realised volatility of the mid around t0 (pp per sqrt-minute), descriptive only
    dmid = np.diff(mid[:, T0:T0 + 61], axis=1)
    rv_pp = float(np.sqrt(np.mean(np.sum(dmid ** 2, axis=1))) * 100)

    m = quoted
    return dict(
        n=int(n), n_quoted=int(m.sum()), n_noquote=int((~m).sum()),
        n_abandon=int((abandon & m).sum()), n_replaced=int((replaced & m).sum()),
        n_exercised=int((exercised & m).sum()), n_live=int((live & m).sum()),
        n_expired=int((expired & m).sum()),
        realised_vol_pp_per_sqrt_min=rv_pp,
        arrays=dict(
            q=q[m], fee=fee[m], A_slip=A_slip[m], C_slip=C_slip[m], A_sigs=A_sigs[m],
            C_sigs=C_sigs[m], buyer_adv_C=buyer_adv_C[m], replaced=replaced[m],
            repl_signed=repl_signed[m], gross_use=gross_use[m], gross_exp=gross_exp[m],
            live=live[m], exercised=exercised[m], payout=payout[m], lock=lock[m],
            opp=opp[m], maker_net=maker_net[m], A_resid=(q - A_fill)[m] * ~abandon[m],
            C_resid=(q - C_fill)[m] * ~abandon[m], abandon=abandon[m], H=np.full(m.sum(), H),
            A_miss=(~hit & ~abandon)[m],
        ),
    )


# --------------------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------------------
def boot_ci(x, rng, B=1000, scale=1.0):
    x = np.asarray(x, dtype=float)
    if x.size == 0:
        return dict(mean=None, lo=None, hi=None, n=0)
    idx = rng.integers(0, x.size, (B, x.size))
    means = x[idx].mean(axis=1)
    return dict(mean=float(x.mean() * scale), lo=float(np.percentile(means, 2.5) * scale),
                hi=float(np.percentile(means, 97.5) * scale), n=int(x.size))


def summarise(res, rng, B):
    a = res["arrays"]
    usd = 1 / MICRO
    rep = a["replaced"]
    out = dict(
        n_orders=res["n"], n_quoted=res["n_quoted"], n_noquote=res["n_noquote"],
        n_abandon=res["n_abandon"], n_replaced=res["n_replaced"], n_live=res["n_live"],
        n_exercised=res["n_exercised"], n_expired=res["n_expired"],
        realised_vol_pp_per_sqrt_min=res["realised_vol_pp_per_sqrt_min"],
        A_miss_rate_pp=boot_ci(a["A_miss"], rng, B, 100.0),
        repl_signed_usd_per_replaced_order=boot_ci(a["repl_signed"][rep], rng, B, usd),
        repl_adverse_usd_per_replaced_order=boot_ci(np.maximum(a["repl_signed"][rep], 0), rng, B, usd),
        A_slip_usd_per_order=boot_ci(a["A_slip"], rng, B, usd),
        C_slip_incl_fee_usd_per_order=boot_ci(a["C_slip"], rng, B, usd),
        fee_usd_per_order=boot_ci(a["fee"], rng, B, usd),
        gross_protection_at_use_usd_per_live_hold=boot_ci(a["gross_use"][a["live"]], rng, B, usd),
        gross_protection_at_expiry_usd_per_needed_order=boot_ci(a["gross_exp"][~a["abandon"]], rng, B, usd),
        buyer_adv_C_minus_A_usd_per_order=boot_ci(a["buyer_adv_C"], rng, B, usd),
        buyer_adv_C_minus_A_usd_per_needed_order=boot_ci(a["buyer_adv_C"][~a["abandon"]], rng, B, usd),
        maker_fee_usd_per_hold=boot_ci(a["fee"], rng, B, usd),
        maker_option_payout_usd_per_hold=boot_ci(a["payout"], rng, B, usd),
        maker_opp_cost_usd_per_hold=boot_ci(a["opp"], rng, B, usd),
        maker_net_usd_per_hold=boot_ci(a["maker_net"], rng, B, usd),
        inventory_lock_share_secs_per_hold=float(a["lock"].mean()),
        A_unfillable_residual_shares_per_order=float(a["A_resid"].mean()),
        C_unfillable_residual_shares_per_order=float(a["C_resid"].mean()),
        network_sigs_per_order=dict(A=float(a["A_sigs"].mean()), C=float(a["C_sigs"].mean())),
    )
    return out


def breakeven_rate_micro(res, H):
    """Rate (micro$/share-min) where mean fee == mean option payout over all holds."""
    a = res["arrays"]
    return float(a["payout"].mean() / (a["q"].mean() * H / 60.0))


def breakeven_rate_allin_micro(res, H, reg: Regime, maker=MakerAssumption()):
    a = res["arrays"]
    rel = (~a["live"]).mean() * SIG_COST_MICRO
    return float((a["payout"].mean() + a["opp"].mean() + rel) / (a["q"].mean() * H / 60.0))


# --------------------------------------------------------------------------------------
# One worked observation on a PUBLIC Gemini book snapshot (read from disk; harness never fetches)
# --------------------------------------------------------------------------------------
def gemini_observation(rate_micro, q=40, H=60):
    import glob
    files = sorted(glob.glob(os.path.join(HERE, "gemini-book-snapshot-*.json")))
    if not files:
        return None
    snap = json.load(open(files[-1]))
    asks = [(int(round(float(l["price"]) * MICRO)), float(l["amount"])) for l in snap["book"]["asks"]]
    levels = sorted(asks)
    top_px, top_qty = levels[0]
    cost, filled = book_cost_levels([(px, int(qty)) for px, qty in levels], q)
    fee = int(hold_fee_micro(rate_micro, q, H))
    return dict(
        label=f"snapshot, retrieved {snap['retrieved_at_utc']}", source=snap["url"],
        symbol="GEMI-FED261211-HIKE25", q_contracts=q,
        top_ask_usd=top_px / MICRO, top_ask_qty=top_qty,
        walked_cost_usd=cost / MICRO, filled=filled, avg_usd_per_share=cost / filled / MICRO,
        atomic_buy_at_top_limit_fills=bool(q <= top_qty),
        instant_size_replacement_cost_usd=(cost - q * top_px) / MICRO,
        hold_fee_usd_at_rate=fee / MICRO, H_secs=H,
        gross_protection_if_ask_up_1_tick_usd=q * TICK / MICRO,
        caveat=("Single snapshot of a reference venue (display-only, not executable on our program). "
                "No volatility or time-series inference is drawn from it."))


# --------------------------------------------------------------------------------------
# Chart
# --------------------------------------------------------------------------------------
def make_chart(results, path, rate_usd):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    colors = {"placid": "#2a78b5", "normal": "#5b8c3a", "volatile": "#c0392b", "thin": "#8e5ea2"}
    Hs = results["sweep_H"]["H_values"]
    fig, ax = plt.subplots(figsize=(9, 5.4), dpi=110)
    offs = {"placid": -3, "normal": -1, "volatile": 1, "thin": 3}
    for rname, rows in results["sweep_H"]["by_regime"].items():
        m = np.array([r["buyer_adv_C_minus_A_usd_per_order"]["mean"] for r in rows])
        lo = np.array([r["buyer_adv_C_minus_A_usd_per_order"]["lo"] for r in rows])
        hi = np.array([r["buyer_adv_C_minus_A_usd_per_order"]["hi"] for r in rows])
        xs = np.array(Hs) + offs[rname]
        ax.errorbar(xs, m, yerr=[m - lo, hi - m], marker="o", capsize=3, lw=1.8,
                    color=colors[rname], label=rname)
    ax.axhline(0, color="#333", lw=1)
    ax.set_xticks(Hs)
    ax.set_xlabel("Hold length H (seconds)")
    ax.set_ylabel("Buyer net advantage of priced hold vs baseline\n($ per order, fee + network incl.; >0 = hold better)")
    ax.set_title(results["chart_title"], fontsize=11)
    ax.text(0.01, 0.02,
            f"SEEDED SYNTHETIC paths, not venue data. Rate ${rate_usd:.6f}/share-min; D~lognormal "
            f"median {results['assumptions']['behaviour']['d_median']:.0f}s; p_abandon "
            f"{results['assumptions']['behaviour']['p_abandon']}; error bars = bootstrap 95% CI.",
            transform=ax.transAxes, fontsize=7.5, color="#555")
    ax.text(0.01, 0.06,
            "Thin: dollar figures exclude unfillable shares; the baseline leaves "
            f"{results['regimes']['thin']['A_unfillable_residual_shares_per_order']:.2f} shares/order unfilled vs "
            f"{results['regimes']['thin']['C_unfillable_residual_shares_per_order']:.2f} with a hold (unpriced).",
            transform=ax.transAxes, fontsize=7.5, color="#555")
    ax.legend(title="regime", loc="upper left", fontsize=9)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path, format="svg")
    plt.close(fig)


# --------------------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------------------
def run(n, seed, B, rate_override=None, out_json=None, chart=None):
    beh = Behaviour()
    rng = np.random.default_rng(seed_for(seed, "boot"))
    Hs = [10, 30, 60, 120]
    results = dict(
        label="SEEDED SYNTHETIC paths (logit random walk + jumps, 1 s steps); not venue data",
        seed=seed, n_per_cell=n, bootstrap_resamples=B,
        units=dict(prices="$/share (computed in integer micro-dollars)",
                   orders="$/order", vol="probability points (pp) per sqrt-minute",
                   rate="$/share-minute", lock="share-seconds"),
        assumptions=dict(
            behaviour=asdict(beh), maker=asdict(MakerAssumption()),
            regimes={k: asdict(v) for k, v in REGIMES.items()},
            sol_usd=SOL_USD_ASSUMPTION, lamports_per_signature=LAMPORTS_PER_SIG,
            sig_cost_usd=SIG_COST_MICRO / MICRO,
            notes=["B has identical fills/economics to A (labels only).",
                   "C exercise is rational: buyer skips exercise if a full-size market buy at t0+D is cheaper.",
                   "Expired hold (D>=H) falls back to A's path at t0+D, plus the sunk fee.",
                   "Unfillable residual shares are counted, never priced.",
                   "Maker payout uses q*max(a(t0+D)-a0,0) at top of ladder on exercised holds."]),
    )

    # 1) break-even rate in the normal regime (option payout only)
    be = {}
    for H in Hs:
        res = simulate(REGIMES["normal"], beh, H, 0, n, seed_for(seed, "normal"))
        be[H] = dict(option_only_usd_per_share_min=breakeven_rate_micro(res, H) / MICRO,
                     all_in_usd_per_share_min=breakeven_rate_allin_micro(res, H, REGIMES["normal"]) / MICRO)
    rec_micro = int(math.ceil(be[60]["option_only_usd_per_share_min"] * MICRO))
    rate = rate_override if rate_override is not None else rec_micro
    results["breakeven_normal"] = {str(k): v for k, v in be.items()}
    results["recommended_rate_usd_per_share_min"] = rec_micro / MICRO
    results["rate_used_usd_per_share_min"] = rate / MICRO

    # 2) per-regime table at H=60 + H sweep (common random numbers across H and mechanisms)
    results["regimes"] = {}
    results["sweep_H"] = dict(H_values=Hs, by_regime={})
    for rname, reg in REGIMES.items():
        rows = []
        for H in Hs:
            res = simulate(reg, beh, H, rate, n, seed_for(seed, rname))
            s = summarise(res, rng, B)
            s["H"] = H
            s["breakeven_rate_option_only_usd_per_share_min"] = breakeven_rate_micro(res, H) / MICRO
            rows.append(s)
            if H == 60:
                results["regimes"][rname] = s
        results["sweep_H"]["by_regime"][rname] = rows

    # 3) one-factor sweeps on the normal regime at H=60
    base = REGIMES["normal"]
    sweeps = {
        "d_median_s": [(v, base, replace(beh, d_median=v)) for v in (5, 20, 60)],
        "level_size_shares": [(v, replace(base, level_size=v), beh) for v in (5, 20, 50, 200)],
        "spread_ticks": [(v, replace(base, spread_ticks=v), beh) for v in (1, 2, 4)],
        "vol_multiplier": [(v, replace(base, sigma=base.sigma * v, jump_rate=base.jump_rate * v), beh)
                           for v in (0.5, 1, 2, 4)],
    }
    results["sweeps_normal_H60"] = {}
    for key, cells in sweeps.items():
        rows = []
        for v, reg, b in cells:
            res = simulate(reg, b, 60, rate, n, seed_for(seed, "normal"))
            s = summarise(res, rng, B)
            rows.append(dict(value=v, n=s["n_quoted"],
                             buyer_adv=s["buyer_adv_C_minus_A_usd_per_order"],
                             maker_net=s["maker_net_usd_per_hold"],
                             A_miss_rate_pp=s["A_miss_rate_pp"],
                             breakeven_rate_usd_per_share_min=breakeven_rate_micro(res, 60) / MICRO))
        results["sweeps_normal_H60"][key] = rows

    # 4) A vs B equivalence (identical arrays by construction)
    results["A_vs_B"] = "identical fills, prices and fees on every path; B's benefit is informational only"

    # chart title states the conclusion derived from the H=60 numbers
    adv = {k: v["buyer_adv_C_minus_A_usd_per_order"] for k, v in results["regimes"].items()}
    helps = [k for k, v in adv.items() if v["lo"] > 0]
    hurts = [k for k, v in adv.items() if v["hi"] < 0]
    results["helps_regimes_H60"], results["hurts_regimes_H60"] = helps, hurts
    results["chart_title"] = (
        f"Priced hold beats the atomic-buy baseline only in the {', '.join(helps) if helps else 'no'} regime;\n"
        f"at the normal-regime break-even rate (${rate / MICRO:.5f}/share-min) it is a net buyer cost in "
        f"{', '.join(hurts) if hurts else 'no regime'}")

    # 5) each regime at its OWN H=60 break-even rate: is a fairly priced hold still worth it?
    results["at_own_breakeven_rate_H60"] = {}
    for rname, reg in REGIMES.items():
        r_own = int(math.ceil(results["regimes"][rname]["breakeven_rate_option_only_usd_per_share_min"] * MICRO))
        res = simulate(reg, beh, 60, r_own, n, seed_for(seed, rname))
        s = summarise(res, rng, B)
        results["at_own_breakeven_rate_H60"][rname] = dict(
            rate_usd_per_share_min=r_own / MICRO, buyer_adv=s["buyer_adv_C_minus_A_usd_per_order"],
            maker_net=s["maker_net_usd_per_hold"])
    results["gemini_observation"] = gemini_observation(rate)
    if chart:
        make_chart(results, chart, rate / MICRO)
        results["chart"] = os.path.relpath(chart, ROOT)
    if out_json:
        with open(out_json, "w") as f:
            json.dump(results, f, indent=1)
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=4000, help="orders per cell")
    ap.add_argument("--seed", type=int, default=20261120)
    ap.add_argument("--boot", type=int, default=1000, help="bootstrap resamples")
    ap.add_argument("--rate", type=float, default=None, help="override hold rate, $/share-min")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "results.json"))
    ap.add_argument("--chart", default=os.path.join(ROOT, "frontend", "public", "econ", "hold-vs-baseline.svg"))
    args = ap.parse_args()
    n, B = (500, 200) if args.quick else (args.n, args.boot)
    rate = None if args.rate is None else int(round(args.rate * MICRO))
    r = run(n, args.seed, B, rate, args.out, args.chart)
    print(f"recommended rate: ${r['recommended_rate_usd_per_share_min']:.6f}/share-min "
          f"(rate used ${r['rate_used_usd_per_share_min']:.6f})")
    for k, s in r["regimes"].items():
        b, mk = s["buyer_adv_C_minus_A_usd_per_order"], s["maker_net_usd_per_hold"]
        print(f"{k:9s} n={s['n_quoted']:5d} miss={s['A_miss_rate_pp']['mean']:5.1f}pp "
              f"buyerAdv(C-A)={b['mean']:+.4f} [{b['lo']:+.4f},{b['hi']:+.4f}] $/order  "
              f"makerNet={mk['mean']:+.4f} [{mk['lo']:+.4f},{mk['hi']:+.4f}] $/hold")
    print(r["chart_title"])


if __name__ == "__main__":
    main()
