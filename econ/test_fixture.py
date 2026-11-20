#!/usr/bin/env python3
"""Required hand fixture + invariants. Run: python3 econ/test_fixture.py  (or pytest econ/)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as h  # noqa: E402

USD = h.MICRO


def test_hand_fixture():
    q, held = 20, 600_000                           # hold 20 shares at $0.60
    # later 20 shares available at $0.64: walk an explicit book to get the replacement price
    cost_up, filled_up = h.book_cost_levels([(640_000, 20)], q)
    assert filled_up == 20
    gross_up = h.gross_protection_micro(q, held, cost_up // q)
    regret_up = h.binding_regret_micro(q, held, cost_up // q)
    # later 20 shares available at $0.56
    cost_dn, filled_dn = h.book_cost_levels([(560_000, 20)], q)
    gross_dn = h.gross_protection_micro(q, held, cost_dn // q)
    regret_dn = h.binding_regret_micro(q, held, cost_dn // q)

    assert gross_up == 800_000, gross_up            # $0.80 gross benefit before costs
    assert regret_up == 0
    assert gross_dn == 0                            # buyer-held protection pays $0
    assert regret_dn == 800_000                     # binding buy at $0.60 is $0.80 worse

    print("HAND FIXTURE (q = 20 shares, held/binding price $0.60)")
    print(f"{'later ask':>10} | {'buyer-held hold: gross protection':>34} | {'BINDING buy at $0.60 vs waiting':>32}")
    print(f"{'$0.64':>10} | {'+$%.2f (before fee/network costs)' % (gross_up / USD):>34} | "
          f"{'$%.2f worse' % (regret_up / USD):>32}")
    print(f"{'$0.56':>10} | {'$%.2f' % (gross_dn / USD):>34} | {'$%.2f worse' % (regret_dn / USD):>32}")
    print("(Stylized gross benefit: neither a fair option premium nor a venue loss estimate.)")


def test_walk_and_fee():
    # 3 levels of 8 at $0.50/$0.51/$0.52; q = 20 -> 8*.50 + 8*.51 + 4*.52 = 10.16
    cost, filled, marg = h.walk_cost(500_000, 8, 3, 20)
    assert (int(cost), int(filled), int(marg)) == (10_160_000, 20, 520_000)
    cost, filled, _ = h.walk_cost(500_000, 8, 3, 40)        # only 24 available
    assert int(filled) == 24
    cost, filled, _ = h.walk_cost(500_000, 0, 3, 5)         # depth disappeared
    assert int(filled) == 0 and int(cost) == 0
    # fee = ceil(rate * q * H / 60): 1001 micro * 20 * 30 / 60 = 10010 exactly; 1 * 1 * 1 / 60 -> 1
    assert int(h.hold_fee_micro(1001, 20, 30)) == 10_010
    assert int(h.hold_fee_micro(1, 1, 1)) == 1


def test_no_lookahead():
    ask = np.arange(20, dtype=np.int64).reshape(2, 10)
    obs = h.Observer(ask, ask)
    obs.book(np.array([3, 4]), now=np.array([3, 4]))
    try:
        obs.book(np.array([5, 4]), now=np.array([4, 4]))
    except h.LookaheadError:
        return
    raise AssertionError("lookahead not prevented")


def test_determinism_and_A_equals_B():
    reg, beh = h.REGIMES["normal"], h.Behaviour()
    r1 = h.simulate(reg, beh, 60, 1000, 300, 7)
    r2 = h.simulate(reg, beh, 60, 1000, 300, 7)
    assert np.array_equal(r1["arrays"]["buyer_adv_C"], r2["arrays"]["buyer_adv_C"])
    # zero-rate hold can never cost the buyer more than A except network fees / abandon
    r0 = h.simulate(reg, beh, 60, 0, 300, 7)
    a = r0["arrays"]
    assert np.all(a["A_slip"] - a["C_slip"] >= 0)


if __name__ == "__main__":
    test_hand_fixture()
    test_walk_and_fee()
    test_no_lookahead()
    test_determinism_and_A_equals_B()
    print("all fixture tests passed")
