/**
 * Creates demo sellers + listings so the feed isn't empty for a demo.
 * Everything here is a real on-chain transaction — seller records start at
 * zero and only change through real orders.
 *
 *   npm run seed-demo
 *
 * Seller keys are saved in keys/seller-*.json. To act as a demo seller in the
 * app, import that key into a wallet (e.g. Phantom → Add account → Import private key).
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { getProgram, getProvider, listingPda, loadOrCreateKeypair, sellerPda } from "./common";

type DemoListing = { title: string; imageUrl: string; price: number };
type DemoSeller = { keyFile: string; name: string; listings: DemoListing[] };

const SELLERS: DemoSeller[] = [
  {
    keyFile: "seller-glow.json",
    name: "Glow Lab Skincare",
    listings: [
      { title: "Vitamin C Brightening Serum", imageUrl: "", price: 2 },
      { title: "Overnight Lip Mask (3-pack)", imageUrl: "", price: 1.5 },
    ],
  },
  {
    keyFile: "seller-gadget.json",
    name: "Pocket Gadget Co",
    listings: [
      { title: "Magnetic Phone Grip + Stand", imageUrl: "", price: 1 },
      { title: "Mini Thermal Label Printer", imageUrl: "", price: 3 },
    ],
  },
  {
    keyFile: "seller-flash.json",
    name: "FlashDeals99",
    listings: [{ title: "AirBuds Pro (95% OFF!!)", imageUrl: "", price: 1 }],
  },
];

async function fund(provider: anchor.AnchorProvider, to: Keypair, sol: number) {
  const bal = await provider.connection.getBalance(to.publicKey);
  if (bal >= sol * LAMPORTS_PER_SOL * 0.5) return;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: to.publicKey,
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    })
  );
  await provider.sendAndConfirm(tx);
}

async function main() {
  const provider = getProvider();
  const program = getProgram(provider);

  for (const s of SELLERS) {
    const kp = loadOrCreateKeypair(s.keyFile);
    await fund(provider, kp, 0.05);
    const profile = sellerPda(program.programId, kp.publicKey);

    if (!(await program.account.seller.fetchNullable(profile))) {
      await program.methods
        .registerSeller(s.name)
        .accountsPartial({ authority: kp.publicKey, seller: profile })
        .signers([kp])
        .rpc();
      console.log(`Registered ${s.name} (${kp.publicKey.toBase58()})`);
    }

    // Only create listings this seller doesn't have yet.
    const { listingCount } = await program.account.seller.fetch(profile);
    for (let i = listingCount.toNumber(); i < s.listings.length; i++) {
      const l = s.listings[i];
      await program.methods
        .createListing(l.title, l.imageUrl, new anchor.BN(Math.round(l.price * 1_000_000)))
        .accountsPartial({ authority: kp.publicKey, seller: profile, listing: listingPda(program.programId, profile, i) })
        .signers([kp])
        .rpc();
      console.log(`  + ${l.title} ($${l.price})`);
    }
  }
  console.log("\nDemo data ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
