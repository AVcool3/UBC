/**
 * Independent receipt verification.
 *
 * Given only a transaction signature, this rebuilds what happened from the
 * chain and CHECKS it, without trusting anything our app stored:
 *   - which cluster the RPC is on (genesis hash), and the commitment level;
 *   - the transaction succeeded and invoked our program;
 *   - the program's events (schema_version 1) and the actual token balance
 *     changes agree (payment and shares moved in the same transaction);
 *   - the Hold account is owned by our program, sits at the PDA derived from
 *     its own fields, and its stored price/qty/buyer/status match the event;
 *   - the pool's custody invariant holds right now (vault = available + reserved).
 */
import { EventParser } from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";
import { PublicKey as PK } from "@solana/web3.js";
import { PROGRAM_ID } from "./contracts";
import type { HeldProgram } from "./core";
import { holdPda } from "./pda";
import { holdStatus } from "./types";

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export type CheckResult = { ok: boolean | null; title: string; detail: string };
export type ReceiptKind = "buy_now" | "hold_created" | "hold_exercised" | "hold_released" | "other";

export interface Receipt {
  signature: string;
  kind: ReceiptKind;
  slot: number;
  blockTime: number | null;
  commitment: "processed" | "confirmed" | "finalized" | "unknown";
  cluster: string;
  fields: Record<string, string | number>;
  /** The hold this receipt is about, if any. */
  hold: string | null;
  checks: CheckResult[];
}

type Ev = { name: string; data: Record<string, unknown> };
const pkStr = (v: unknown) => (v as PublicKey)?.toBase58?.() ?? String(v);
const num = (v: unknown) => Number((v as { toString(): string })?.toString?.() ?? v);

export async function loadReceipt(connection: Connection, program: HeldProgram, signature: string): Promise<Receipt> {
  const checks: CheckResult[] = [];
  const [genesis, statuses, tx] = await Promise.all([
    connection.getGenesisHash(),
    connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
    connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }),
  ]);
  if (!tx) throw new Error("Transaction not found on this cluster (it may be on a different network, or not confirmed yet).");
  const cluster = genesis === DEVNET_GENESIS ? "devnet" : `unknown (genesis ${genesis.slice(0, 8)}…)`;
  checks.push({ ok: genesis === DEVNET_GENESIS, title: "Read from Solana devnet", detail: `RPC genesis hash ${genesis.slice(0, 12)}… ${genesis === DEVNET_GENESIS ? "is devnet's" : "is not devnet's"}.` });

  const status = statuses.value[0];
  const commitment = (status?.confirmationStatus ?? "unknown") as Receipt["commitment"];
  checks.push({
    ok: tx.meta?.err == null,
    title: "Transaction succeeded",
    detail: tx.meta?.err ? `Failed: ${JSON.stringify(tx.meta.err)}` : `Included in slot ${tx.slot}; commitment now "${commitment}".`,
  });

  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys;
  const invoked = keys.some((k) => k.equals(PROGRAM_ID));
  checks.push({ ok: invoked, title: "Called the Held Price program", detail: `Program ${PROGRAM_ID.toBase58()} ${invoked ? "is" : "is NOT"} in the transaction.` });

  // ---- Events ----
  // program.coder uses the camelCased IDL: events "filled", "holdCreated", fields "totalPaid"…
  const parser = new EventParser(PROGRAM_ID, program.coder);
  const events: Ev[] = [...parser.parseLogs(tx.meta?.logMessages ?? [])] as Ev[];
  const versionsOk = events.length > 0 && events.every((e) => num(e.data.schemaVersion) === 1);
  checks.push({ ok: versionsOk, title: "Program events decoded", detail: `${events.map((e) => e.name).join(", ") || "none"} (schema_version 1).` });

  // ---- Token balance changes, keyed by owner + mint ----
  const delta = new Map<string, number>();
  const add = (list: typeof tx.meta extends null ? never : NonNullable<typeof tx.meta>["preTokenBalances"], sign: number) =>
    (list ?? []).forEach((b) => {
      const k = `${b.owner}:${b.mint}`;
      delta.set(k, (delta.get(k) ?? 0) + sign * Number(b.uiTokenAmount.amount));
    });
  add(tx.meta?.postTokenBalances, 1);
  add(tx.meta?.preTokenBalances, -1);
  const d = (owner: string, mint: string) => delta.get(`${owner}:${mint}`) ?? 0;

  const filled = events.find((e) => e.name === "filled");
  const created = events.find((e) => e.name === "holdCreated");
  const released = events.find((e) => e.name === "holdReleased");
  let kind: ReceiptKind = "other";
  const fields: Record<string, string | number> = {};
  let hold: string | null = null;

  if (filled) {
    const f = filled.data;
    kind = num(f.kind) === 1 ? "hold_exercised" : "buy_now";
    const [buyer, pool, yes, usdc] = [pkStr(f.buyer), pkStr(f.pool), pkStr(f.outcomeMint), pkStr(f.collateralMint)];
    const qty = num(f.qty);
    const total = num(f.totalPaid);
    Object.assign(fields, { buyer, maker: pkStr(f.maker), qty, price: num(f.price), totalPaid: total, termsSeq: num(f.termsSeq), filledAt: num(f.filledAt), yesMint: yes, collateralMint: usdc, pool });
    const proceedsOwner = pool; // proceeds vault is owned by the pool PDA
    const atomic =
      d(buyer, yes) === qty && d(buyer, usdc) === -total && d(proceedsOwner, usdc) === total && d(pool, yes) === -qty;
    checks.push({
      ok: atomic,
      title: "Payment and shares moved together",
      detail: `In this one transaction: buyer +${qty} YES and −${total / 1e6} USDC; pool custody −${qty} YES; pool proceeds +${total / 1e6} USDC.`,
    });
    checks.push({ ok: num(f.price) * qty === total, title: "Total = price × quantity", detail: `${num(f.price)} × ${qty} = ${total} base units (no rounding).` });
    if (kind === "hold_exercised") hold = pkStr(f.hold);
  } else if (created) {
    const c = created.data;
    kind = "hold_created";
    hold = pkStr(c.hold);
    Object.assign(fields, { buyer: pkStr(c.buyer), maker: pkStr(c.maker), qty: num(c.qty), price: num(c.price), feePaid: num(c.feePaid), createdAt: num(c.createdAt), expiresAt: num(c.expiresAt), termsSeq: num(c.termsSeq), pool: pkStr(c.pool) });
  } else if (released) {
    const r = released.data;
    kind = "hold_released";
    hold = pkStr(r.hold);
    Object.assign(fields, { buyer: pkStr(r.buyer), qty: num(r.qty), releasedBy: pkStr(r.caller), releasedAt: num(r.releasedAt), pool: pkStr(r.pool) });
    checks.push({ ok: delta.size === 0 || [...delta.values()].every((v) => v === 0), title: "No tokens moved on release", detail: "Release only moves shares from reserved back to available inside the pool's books." });
  }

  // ---- The Hold account itself (program-owned state) ----
  if (hold) {
    const holdKey = new PK(hold);
    const info = await connection.getAccountInfo(holdKey, "confirmed");
    const owned = !!info && info.owner.equals(PROGRAM_ID);
    checks.push({ ok: owned, title: "Hold account is owned by the program", detail: owned ? "Only the program can change it." : "Owner mismatch or missing." });
    if (owned) {
      const h = await program.account.hold.fetch(holdKey);
      const derived = holdPda(h.pool, h.buyer, h.nonce);
      checks.push({ ok: derived.equals(holdKey), title: "Hold address derives from its own fields", detail: `PDA("hold", pool, buyer, nonce ${h.nonce.toString()}) = ${derived.toBase58().slice(0, 8)}…` });
      const st = holdStatus(h);
      const expectStatus = kind === "hold_exercised" ? "exercised" : kind === "hold_released" ? "released" : null;
      const evPrice = fields.price as number | undefined;
      const evQty = fields.qty as number | undefined;
      const match =
        (evPrice === undefined || h.price.toNumber() === evPrice) && (evQty === undefined || h.qty.toNumber() === evQty) && h.buyer.toBase58() === fields.buyer;
      checks.push({
        ok: match && (expectStatus ? st === expectStatus : true),
        title: "On-chain hold matches the receipt",
        detail: `Stored: ${h.qty.toNumber()} shares at ${h.price.toNumber() / 1e6} for ${h.buyer.toBase58().slice(0, 6)}…, status "${st}", expires ${new Date(h.expiresAt.toNumber() * 1000).toISOString()}.`,
      });
      fields.holdStatus = st;
      fields.holdExpiresAt = h.expiresAt.toNumber();
      fields.holdCreatedAt = h.createdAt.toNumber();
      fields.holdFee = h.feePaid.toNumber();
      if (kind === "hold_created") {
        const feeMoved = d(String(fields.buyer), h.collateralMint.toBase58()) === -h.feePaid.toNumber();
        checks.push({ ok: feeMoved, title: "Only the disclosed fee was charged", detail: `Buyer paid ${h.feePaid.toNumber() / 1e6} USDC now; the shares are paid for only at exercise.` });
      }
    }
  }

  // ---- Custody invariant, right now ----
  if (fields.pool) {
    const poolKey = new PK(String(fields.pool));
    const p = await program.account.pool.fetch(poolKey);
    const vault = Number((await connection.getTokenAccountBalance(p.yesVault, "confirmed")).value.amount);
    const ok = vault === p.available.toNumber() + p.reserved.toNumber();
    checks.push({ ok, title: "Pool custody adds up (now)", detail: `Vault holds ${vault} YES = ${p.available.toNumber()} available + ${p.reserved.toNumber()} reserved by holds.` });
  }

  return { signature, kind, slot: tx.slot, blockTime: tx.blockTime ?? null, commitment, cluster, fields, hold, checks };
}
