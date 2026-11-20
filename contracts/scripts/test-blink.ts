/**
 * End-to-end check of the Blink (Solana Action) endpoints, acting exactly like
 * a spec-compliant Blink client (dial.to, Phantom on X, …) would:
 *
 *   1. GET the action → check the card + buttons + input fields
 *   2. fill the form, POST { account, data } → get a transaction back
 *   3. verify it like a client must (existing signatures valid; only the buyer's is missing)
 *   4. sign as the buyer, send, confirm, then read the Order account
 *   5. open the sealed address with the carrier's key → it must match what was typed
 *
 * Uses a brand-new wallet with 0 SOL and 0 USDC, so it also proves demo
 * sponsorship works (the faucet adds gas + test USDC in the same transaction).
 *
 * Usage (app running with demo mode on):
 *   BLINK_BASE=http://127.0.0.1:3000 npx tsx scripts/test-blink.ts
 */
import { Keypair, Transaction } from "@solana/web3.js";
import fs from "fs";
import nacl from "tweetnacl";
import { getProgram, getProvider } from "./common";

const BASE = process.env.BLINK_BASE ?? "http://127.0.0.1:3000";
const SERUM = process.env.BLINK_LISTING ?? "HmBi2b7o5ANu1e2mGhe2QKuAqeYQbvWSMJ1BEGfiZ4dY"; // Glow Lab, ships on autopilot
const SCAM = process.env.BLINK_SCAM_LISTING ?? "GBcVgtvcsRePJfMmiP7qkiSeAAMW2ZRD9DGcKy46fMQJ"; // FlashDeals99

function check(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ✓ ${what}`);
}

async function getJson(path: string) {
  const res = await fetch(BASE + path);
  return { res, body: (await res.json()) as any };
}

/** Same steps a Blink client does when the user presses the button. */
async function pressBuy(listing: string, account: string, form: Record<string, string>) {
  const { body: action } = await getJson(`/api/actions/buy/${listing}`);
  const linked = action.links.actions[0];
  // Clients substitute {param} in the href with the URL-encoded value...
  let href: string = linked.href;
  for (const [k, v] of Object.entries(form)) href = href.replace(`{${k}}`, encodeURIComponent(v));
  // ...and newer ones also send the values as `data`.
  const res = await fetch(new URL(href, BASE), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, data: form }),
  });
  return { res, body: (await res.json()) as any };
}

(async () => {
  const program = getProgram(getProvider());
  const conn = program.provider.connection;
  const carrierEnc = JSON.parse(fs.readFileSync("keys/carrier-encryption.json", "utf8"));
  const carrierSecret = Buffer.from(carrierEnc.secretKey, "base64");

  console.log("1. actions.json + CORS");
  const aj = await getJson("/actions.json");
  check(aj.res.headers.get("access-control-allow-origin") === "*", "actions.json is cross-origin readable");
  check(aj.body.rules.some((r: any) => r.pathPattern === "/buy/*"), "maps /buy/* to the Action API");
  const pre = await fetch(`${BASE}/api/actions/buy/${SERUM}`, { method: "OPTIONS" });
  check(pre.status === 204 && pre.headers.get("access-control-allow-methods")?.includes("POST"), "CORS preflight answers");

  console.log("2. GET the card");
  const { res: gres, body: card } = await getJson(`/api/actions/buy/${SERUM}`);
  check(gres.headers.get("x-blockchain-ids") === "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "declares devnet");
  check(card.type === "action" && card.title.includes("Vitamin C") && card.label.startsWith("Buy privately"), `card: "${card.title}"`);
  check(card.links.actions[0].parameters.map((p: any) => p.name).join() === "name,address", "asks for name + address");
  const icon = await fetch(card.icon);
  check(icon.ok && icon.headers.get("content-type") === "image/png", `icon is a PNG (${card.icon})`);
  fs.writeFileSync(process.env.BLINK_ICON_OUT ?? "/tmp/blink-icon.png", Buffer.from(await icon.arrayBuffer()));
  const { body: scamCard } = await getJson(`/api/actions/buy/${SCAM}`);
  check(scamCard.description.includes("⚠"), "risky seller is flagged on the card before paying");
  console.log(`     "${scamCard.description.slice(0, 110)}…"`);

  console.log("3. Bad input is rejected with readable messages");
  const buyer = Keypair.generate();
  const noForm = await pressBuy(SERUM, buyer.publicKey.toBase58(), { name: "", address: "" });
  check(noForm.res.status === 400 && /name and shipping address/.test(noForm.body.message), `empty form → "${noForm.body.message}"`);
  const bad = await getJson(`/api/actions/buy/not-a-key`);
  check(bad.res.status === 404 && bad.body.message, `bad listing → "${bad.body.message}"`);

  console.log("4. Fresh wallet (0 SOL, 0 USDC) buys from the Blink");
  const form = { name: "Jane Doe", address: "2329 West Mall\nVancouver V6T 1Z4\nCanada" };
  const { res: pres, body: post } = await pressBuy(SERUM, buyer.publicKey.toBase58(), form);
  check(pres.ok && post.type === "transaction", `POST → transaction ("${post.message}")`);
  const tx = Transaction.from(Buffer.from(post.transaction, "base64"));
  // Client-side safety checks from the spec:
  check(tx.verifySignatures(false), "existing (faucet) signatures are valid");
  const missing = tx.signatures.filter((s) => !s.signature).map((s) => s.publicKey.toBase58());
  check(missing.length === 1 && missing[0] === buyer.publicKey.toBase58(), "the only missing signature is the buyer's");
  tx.partialSign(buyer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  check(true, `confirmed on devnet: ${sig}`);

  console.log("5. The order on-chain");
  const orders = await program.account.order.all([{ memcmp: { offset: 8, bytes: buyer.publicKey.toBase58() } }]);
  check(orders.length === 1 && "paid" in orders[0].account.status, "one Paid order for this buyer");
  const sealed = Uint8Array.from(orders[0].account.encryptedAddress);
  check(!Buffer.from(sealed).toString("utf8").includes("West Mall"), "address is NOT readable on-chain");
  const opened = nacl.box.open(sealed.slice(56), sealed.slice(32, 56), sealed.slice(0, 32), carrierSecret);
  const plain = opened && new TextDecoder().decode(opened);
  check(plain === "Jane Doe, 2329 West Mall, Vancouver V6T 1Z4, Canada", `carrier decrypts: "${plain}"`);
  check(post.message.includes(orders[0].publicKey.toBase58().slice(0, 6).toUpperCase()), "message shows the same order code");

  console.log("6. Chained 'Track my order' button");
  const next = post.links.next.action.links.actions[0];
  check(next.type === "external-link", "next action is an external link");
  const track = await fetch(new URL(next.href, BASE), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: buyer.publicKey.toBase58() }) });
  const trackBody = (await track.json()) as any;
  check(trackBody.externalLink.endsWith(`/orders?new=${orders[0].publicKey.toBase58()}`), `opens ${trackBody.externalLink}`);

  console.log("7. Second purchase: wallet now has funds, so no sponsorship");
  const { body: post2 } = await pressBuy(SERUM, buyer.publicKey.toBase58(), form);
  const tx2 = Transaction.from(Buffer.from(post2.transaction, "base64"));
  check(tx2.feePayer?.equals(buyer.publicKey) && tx2.signatures.every((s) => !s.signature), "unsigned tx, buyer pays the fee");

  console.log("8. Seller can't buy their own listing via Blink");
  const sellerAuth = (await program.account.listing.fetch(SERUM)).sellerAuthority.toBase58();
  const self = await pressBuy(SERUM, sellerAuth, form);
  check(self.res.status === 400 && /own listing/.test(self.body.message), `→ "${self.body.message}"`);

  console.log("\nBLINK E2E PASSED");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
