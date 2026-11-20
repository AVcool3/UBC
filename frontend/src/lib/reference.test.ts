/**
 * Unit tests for the order-book size walk used by the Gemini reference panel.
 * Run: npm test   (Node's built-in test runner; no extra dependencies)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { walkAsks } from "./reference.ts";

// The real book shape we observed for GEMI-FED261211-HIKE25 (top three asks).
const BOOK = [
  { price: 0.93, amount: 25 },
  { price: 0.94, amount: 6666 },
  { price: 0.95, amount: 120 },
];

test("a size inside the top level fills at the displayed ask", () => {
  const w = walkAsks(BOOK, 20);
  assert.equal(w.levels, 1);
  assert.equal(w.unfilled, 0);
  assert.equal(w.avg, 0.93);
});

test("exactly the top level still fills at one level", () => {
  const w = walkAsks(BOOK, 25);
  assert.equal(w.levels, 1);
  assert.ok(Math.abs((w.avg ?? 0) - 0.93) < 1e-12);
});

test("40 contracts walk to the second level: 25 @ 0.93 + 15 @ 0.94", () => {
  const w = walkAsks(BOOK, 40);
  assert.equal(w.levels, 2);
  assert.equal(w.worst, 0.94);
  assert.ok(Math.abs(w.cost - (25 * 0.93 + 15 * 0.94)) < 1e-9); // $37.35
  assert.ok(Math.abs((w.avg ?? 0) - 37.35 / 40) < 1e-12);
});

test("a size bigger than the visible book reports the unfillable remainder", () => {
  const w = walkAsks(BOOK, 10_000);
  assert.equal(w.filled, 25 + 6666 + 120);
  assert.equal(w.unfilled, 10_000 - (25 + 6666 + 120));
});

test("an empty book fills nothing and has no average", () => {
  const w = walkAsks([], 5);
  assert.equal(w.filled, 0);
  assert.equal(w.unfilled, 5);
  assert.equal(w.avg, null);
});

test("the average never drops below the best ask and never exceeds the worst level touched", () => {
  for (let q = 1; q <= 7000; q += 137) {
    const w = walkAsks(BOOK, q);
    assert.ok((w.avg ?? 0) >= 0.93 - 1e-12);
    assert.ok((w.avg ?? 0) <= w.worst + 1e-12);
  }
});
