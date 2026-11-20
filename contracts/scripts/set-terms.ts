/**
 * Maker updates pool terms (ask, hold rate, max hold). Existing holds keep their price.
 *   ASK=930000 HOLD_RATE=1250 MAX_HOLD=60 ANCHOR_WALLET=keys/seller-glow.json npm run set-terms
 * Values are base units: ask 930000 = $0.93/share; hold rate 1250 = $0.00125 per share-minute.
 */
import { BN } from "@coral-xyz/anchor";
import { getProgram, getProvider, marketPda, poolPda } from "./common";

(async () => {
  const provider = getProvider();
  const program = getProgram(provider);
  const pool = poolPda(program.programId, marketPda(program.programId, Number(process.env.MARKET_ID ?? 1)), provider.wallet.publicKey);
  const p = await program.account.pool.fetch(pool);
  const terms = {
    ask: new BN(process.env.ASK ?? p.ask.toString()),
    holdRate: new BN(process.env.HOLD_RATE ?? p.holdRate.toString()),
    maxHoldSecs: Number(process.env.MAX_HOLD ?? p.maxHoldSecs),
  };
  const sig = await program.methods.setTerms(terms).accountsPartial({ maker: provider.wallet.publicKey, pool }).rpc();
  console.log(`terms set: ask ${terms.ask} rate ${terms.holdRate} maxHold ${terms.maxHoldSecs} → ${sig}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
