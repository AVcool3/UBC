/**
 * Gives the demo sellers a REAL on-chain track record, so the trust badges in
 * the shop (and on Blink cards) tell the story the demo needs:
 *
 *   Glow Lab Skincare  → lots of delivered orders  → "✓ 9x% · N delivered"
 *   Pocket Gadget Co   → delivered orders           → "✓ 100%"
 *   FlashDeals99       → never ships, auto-refunded → red "⚠ risky seller" warning
 *
 * Nothing is written directly: every counter changes only because real orders
 * go through the program (place_order → mark_shipped → confirm_delivery →
 * release_payment, or place_order → deadline passes → refund_unshipped).
 * Buyers are throwaway wallets; their addresses are sealed like any real order.
 *
 * Safe to re-run: it tops each seller up to the targets below and also settles
 * any order a demo seller left unshipped (so tests don't dent their record).
 *
 *   ANCHOR_WALLET=<funded keypair> npm run seed-history
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createHash } from "crypto";
import nacl from "tweetnacl";
import idl from "../target/idl/ghost_checkout.json";
import type { GhostCheckout } from "../target/types/ghost_checkout";
import { configPda, getProgram, getProvider, loadOrCreateKeypair, pda, sellerPda } from "./common";

// Targets. Change these to make the story stronger or weaker.
// High enough that a few demo disputes (each one is a "lost" for the seller) keep them above 90%.
const TARGET_COMPLETED: Record<string, number> = { "seller-glow.json": 30, "seller-gadget.json": 20 };
const TARGET_FLASH_REFUNDS = 2; // "bad" needs at least 2 bad outcomes (see frontend lib/trust.ts)
const ORDERS_PER_BUYER = 6;
// Pause after each transaction. The free devnet RPC rate-limits bursts; lower this with a private RPC.
const PACE_MS = Number(process.env.PACE_MS ?? 1200);

const SAMPLE_ADDRESSES = [
  "Maya Chen, 401 W 2nd St, Austin TX 78701, USA",
  "Liam Patel, 88 King St W, Toronto ON M5H 1A1, Canada",
  "Sofia Rossi, 12 Via Roma, 20121 Milano, Italy",
  "Noah Kim, 220 Pine St, Seattle WA 98101, USA",
  "Ava Johnson, 9 Market St, San Francisco CA 94105, USA",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Public devnet RPC is load-balanced and rate-limited, so a send sometimes fails
 * with "Blockhash not found" or 429. Those fail in simulation, BEFORE anything is
 * sent, so retrying can't double-execute a step.
 */
async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      const result = await fn();
      await sleep(PACE_MS); // stay under the public RPC's rate limit
      return result;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (i >= tries || !/Blockhash not found|429|Too Many Requests|fetch failed|ECONNRESET/i.test(msg)) throw e;
      await sleep(1500 * i);
    }
  }
}
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);

async function main() {
  // Use "confirmed" for everything: the public devnet RPC is load-balanced, and a
  // "processed" blockhash is often unknown to the node that simulates the tx.
  const opts = { commitment: "confirmed", preflightCommitment: "confirmed" } as const;
  const envProvider = getProvider();
  const conn = new Connection(envProvider.connection.rpcEndpoint, "confirmed");
  const provider = new anchor.AnchorProvider(conn, envProvider.wallet, opts);
  const program = getProgram(provider);
  const pid = program.programId;
  const cfgKey = configPda(pid);
  const config = await program.account.config.fetch(cfgKey);
  const mint = config.usdcMint;

  // Program client that signs as `kp` (each role signs its own step).
  const as = (kp: Keypair) =>
    new Program<GhostCheckout>(idl as GhostCheckout, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), opts));

  const faucet = loadOrCreateKeypair("faucet.json"); // test-USDC mint authority
  const carrier = loadOrCreateKeypair("carrier.json");
  const sellers = Object.fromEntries(
    ["seller-glow.json", "seller-gadget.json", "seller-flash.json"].map((f) => [f, loadOrCreateKeypair(f)])
  );
  const sellerByAuthority = new Map(Object.values(sellers).map((k) => [k.publicKey.toBase58(), k]));

  const listingsOf = async (authority: PublicKey) =>
    (await program.account.listing.all()).filter((l) => l.account.sellerAuthority.equals(authority) && l.account.active);
  const statsOf = (authority: PublicKey) => program.account.seller.fetch(sellerPda(pid, authority));

  // ---- Steps, each signed by the role that does it in real life ----------------
  const seal = (text: string) => {
    const eph = nacl.box.keyPair();
    const nonce = nacl.randomBytes(24);
    const box = nacl.box(new TextEncoder().encode(text), nonce, Uint8Array.from(config.carrierEncryptionKey), eph.secretKey);
    return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(nonce), Buffer.from(box)]);
  };

  async function placeOrder(buyer: Keypair, listing: PublicKey, n: number) {
    const nonce = new BN(Date.now() + n); // +n keeps nonces unique inside one millisecond
    const order = pda(pid, [Buffer.from("order"), listing.toBuffer(), buyer.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)]);
    await retry(() => as(buyer)
      .methods.placeOrder(nonce, seal(SAMPLE_ADDRESSES[n % SAMPLE_ADDRESSES.length]))
      .accountsPartial({ buyer: buyer.publicKey, config: cfgKey, listing, order, usdcMint: mint, buyerToken: ata(mint, buyer.publicKey), vault: ata(mint, order) })
      .rpc());
    return order;
  }

  async function ship(seller: Keypair, order: PublicKey) {
    const hash = [...createHash("sha256").update(`HIST-${order.toBase58()}`).digest()];
    await retry(() => as(seller).methods.markShipped(hash).accountsPartial({ sellerAuthority: seller.publicKey, order }).rpc());
  }

  async function cancel(seller: Keypair, order: PublicKey) {
    const o = await program.account.order.fetch(order);
    await retry(() =>
      as(seller)
        .methods.cancelOrder()
        .accountsPartial({
          sellerAuthority: seller.publicKey,
          config: cfgKey,
          seller: sellerPda(pid, seller.publicKey),
          order,
          buyer: o.buyer,
          usdcMint: mint,
          buyerToken: ata(mint, o.buyer),
          vault: ata(mint, order),
        })
        .rpc()
    );
  }

  const deliver = (order: PublicKey) =>
    retry(() => as(carrier).methods.confirmDelivery().accountsPartial({ carrier: carrier.publicKey, config: cfgKey, order }).rpc());

  async function release(order: PublicKey) {
    const o = await program.account.order.fetch(order);
    await retry(() => program.methods
      .releasePayment()
      .accountsPartial({
        caller: provider.wallet.publicKey,
        config: cfgKey,
        seller: sellerPda(pid, o.sellerAuthority),
        order,
        buyer: o.buyer,
        sellerAuthority: o.sellerAuthority,
        usdcMint: mint,
        sellerToken: ata(mint, o.sellerAuthority),
        vault: ata(mint, order),
      })
      .rpc());
  }

  async function refundUnshipped(order: PublicKey) {
    const o = await program.account.order.fetch(order);
    await retry(() => program.methods
      .refundUnshipped()
      .accountsPartial({
        caller: provider.wallet.publicKey,
        config: cfgKey,
        seller: sellerPda(pid, o.sellerAuthority),
        order,
        buyer: o.buyer,
        usdcMint: mint,
        buyerToken: ata(mint, o.buyer),
        vault: ata(mint, order),
      })
      .rpc());
  }

  /** New buyer wallet with a little SOL (from the admin wallet) and test USDC (from the faucet). */
  async function newBuyer(usdc: number) {
    const buyer = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: buyer.publicKey, lamports: 0.06 * LAMPORTS_PER_SOL }),
      createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, ata(mint, buyer.publicKey), buyer.publicKey, mint),
      createMintToInstruction(mint, ata(mint, buyer.publicKey), faucet.publicKey, usdc * 1_000_000)
    );
    await retry(() => provider.sendAndConfirm(tx, [faucet]));
    return buyer;
  }

  const toRelease: PublicKey[] = [];
  const toRefund: PublicKey[] = [];
  // Leftover orders per seller that will complete in step 4 (they count toward the target).
  const leftovers = new Map<string, number>();

  // ---- 1. Settle demo sellers' leftover orders (e.g. from test runs) -----------
  for (const o of await program.account.order.all()) {
    const seller = sellerByAuthority.get(o.account.sellerAuthority.toBase58());
    const status = Object.keys(o.account.status)[0];
    if (!seller || seller === sellers["seller-flash.json"]) continue;
    if (["paid", "shipped", "delivered"].includes(status)) {
      const k = seller.publicKey.toBase58();
      leftovers.set(k, (leftovers.get(k) ?? 0) + 1);
    }
    if (status === "paid" && o.account.shipDeadline.toNumber() < Date.now() / 1000 - 5) {
      // Too late to ship: a real seller would cancel and refund the buyer.
      // (Cancellations don't count as "bad" in the trust score; a non-shipment refund would.)
      await cancel(seller, o.publicKey);
      leftovers.set(seller.publicKey.toBase58(), (leftovers.get(seller.publicKey.toBase58()) ?? 1) - 1);
      console.log(`cancelled expired leftover order ${o.publicKey.toBase58().slice(0, 6)} (buyer refunded)`);
    } else if (status === "paid") {
      await ship(seller, o.publicKey);
      await deliver(o.publicKey);
      toRelease.push(o.publicKey);
      console.log(`settled leftover order ${o.publicKey.toBase58().slice(0, 6)} (shipped + delivered)`);
    } else if (status === "shipped") {
      await deliver(o.publicKey);
      toRelease.push(o.publicKey);
    } else if (status === "delivered") {
      toRelease.push(o.publicKey);
    }
  }

  // ---- 2. Good sellers: real delivered orders ----------------------------------
  for (const [file, target] of Object.entries(TARGET_COMPLETED)) {
    const seller = sellers[file];
    const stats = await statsOf(seller.publicKey);
    const need = Math.max(0, target - stats.completedOrders.toNumber() - (leftovers.get(seller.publicKey.toBase58()) ?? 0));
    const listings = await listingsOf(seller.publicKey);
    console.log(`${stats.name}: ${stats.completedOrders} completed → adding ${need}`);
    let buyer: Keypair | null = null;
    for (let i = 0; i < need; i++) {
      if (i % ORDERS_PER_BUYER === 0) buyer = await newBuyer(30);
      const listing = listings[i % listings.length].publicKey;
      const order = await placeOrder(buyer!, listing, i);
      await ship(seller, order);
      await deliver(order);
      toRelease.push(order);
      process.stdout.write(".");
    }
    if (need) console.log();
  }

  // ---- 3. FlashDeals99: orders it never ships ---------------------------------
  const flash = sellers["seller-flash.json"];
  const flashStats = await statsOf(flash.publicKey);
  const existingFlashPaid = (await program.account.order.all()).filter(
    (o) => o.account.sellerAuthority.equals(flash.publicKey) && "paid" in o.account.status
  );
  const flashNeed = Math.max(0, TARGET_FLASH_REFUNDS - flashStats.refundedUnshipped.toNumber() - existingFlashPaid.length);
  toRefund.push(...existingFlashPaid.map((o) => o.publicKey));
  if (flashNeed) {
    const buyer = await newBuyer(10);
    const listing = (await listingsOf(flash.publicKey))[0].publicKey;
    for (let i = 0; i < flashNeed; i++) toRefund.push(await placeOrder(buyer, listing, 100 + i));
  }
  console.log(`FlashDeals99: ${flashStats.refundedUnshipped} refunds → ${toRefund.length} more pending`);

  // ---- 4. Wait out the windows, then settle -------------------------------------
  // Inspection window must pass before release; ship window before refund_unshipped.
  const wait = Math.max(config.inspectionWindowSecs.toNumber(), toRefund.length ? config.shipWindowSecs.toNumber() : 0) + 5;
  if (toRelease.length || toRefund.length) {
    console.log(`waiting ${wait}s for the inspection / ship windows…`);
    await sleep(wait * 1000);
  }
  for (const order of toRelease) {
    await release(order);
    process.stdout.write("$");
  }
  for (const order of toRefund) {
    await refundUnshipped(order);
    process.stdout.write("↩");
  }
  console.log();

  for (const f of Object.keys(sellers)) {
    const s = await statsOf(sellers[f].publicKey);
    console.log(
      `${s.name.padEnd(18)} completed ${s.completedOrders}  never-shipped ${s.refundedUnshipped}  disputes lost ${s.disputesLost}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
