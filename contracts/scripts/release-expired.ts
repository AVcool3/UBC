/**
 * Permissionless cleanup crank: releases every expired, unused hold so its
 * shares return to the pool's available inventory. Anyone can run this with
 * any funded wallet — the program sends nothing to the caller.
 *
 *   ANCHOR_WALLET=<any funded keypair> npm run release-expired
 */
import { getProgram, getProvider } from "./common";

(async () => {
  const provider = getProvider();
  const program = getProgram(provider);
  const slot = await provider.connection.getSlot("confirmed");
  const now = (await provider.connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const holds = await program.account.hold.all();
  const expired = holds.filter((h) => "held" in h.account.status && h.account.expiresAt.toNumber() <= now);
  for (const h of expired) {
    const sig = await program.methods.release().accountsPartial({ caller: provider.wallet.publicKey, pool: h.account.pool, hold: h.publicKey }).rpc();
    console.log(`released ${h.account.qty} shares from ${h.publicKey.toBase58().slice(0, 8)}… → ${sig}`);
  }
  console.log(`${expired.length} expired hold(s) released; ${holds.length} holds total.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
