/**
 * End-to-end tests for the Ghost Checkout program.
 *
 * `anchor test` starts a fresh local validator, deploys the program, and runs
 * this file. Time windows are set to a few seconds so we can test deadlines by
 * simply waiting.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import nacl from "tweetnacl";
import { createHash } from "crypto";
import { GhostCheckout } from "../target/types/ghost_checkout";

// ---------------------------------------------------------------------------
// Settings used by the whole suite
// ---------------------------------------------------------------------------
const SHIP_WINDOW = 4; // seconds the seller has to ship
const INSPECTION_WINDOW = 4; // seconds the buyer has to dispute after delivery
const USDC = (n: number) => new BN(Math.round(n * 1_000_000)); // 6 decimals

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Asserts that a promise rejects with an Anchor error whose code/name matches. */
async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (err: any) {
    const actual =
      err?.error?.errorCode?.code ?? // AnchorError from program
      err?.message ??
      String(err);
    expect(String(actual) + " " + String(err?.message ?? "")).to.include(code);
    return;
  }
  expect.fail(`Expected error ${code} but the transaction succeeded`);
}

/** Encrypts an address to the carrier's X25519 key, same format the frontend uses:
 *  [ephemeral pubkey 32][nonce 24][ciphertext]. */
function sealAddress(address: string, carrierPub: Uint8Array): Buffer {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(new TextEncoder().encode(address), nonce, carrierPub, eph.secretKey);
  return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(nonce), Buffer.from(box)]);
}

/** Carrier-side decryption of the sealed address. */
function openAddress(sealed: Uint8Array, carrierSecret: Uint8Array): string | null {
  const ephPub = sealed.slice(0, 32);
  const nonce = sealed.slice(32, 56);
  const box = sealed.slice(56);
  const opened = nacl.box.open(box, nonce, ephPub, carrierSecret);
  return opened ? new TextDecoder().decode(opened) : null;
}

describe("ghost_checkout", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GhostCheckout as Program<GhostCheckout>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Actors
  const carrier = Keypair.generate();
  const carrierEnc = nacl.box.keyPair(); // carrier's address-decryption key
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const stranger = Keypair.generate();

  let usdcMint: PublicKey;
  let otherMint: PublicKey;

  // PDA helpers — same seeds as programs/ghost_checkout/src/state.rs
  const pda = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const configPda = pda([Buffer.from("config")]);
  const sellerPda = (auth: PublicKey) => pda([Buffer.from("seller"), auth.toBuffer()]);
  const listingPda = (sellerProfile: PublicKey, index: number) =>
    pda([Buffer.from("listing"), sellerProfile.toBuffer(), new BN(index).toArrayLike(Buffer, "le", 8)]);
  const orderPda = (listing: PublicKey, buyerKey: PublicKey, nonce: BN) =>
    pda([Buffer.from("order"), listing.toBuffer(), buyerKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)]);
  const ata = (owner: PublicKey, mint = usdcMint) => getAssociatedTokenAddressSync(mint, owner, true);

  const balance = async (owner: PublicKey) => {
    try {
      return Number((await getAccount(connection, ata(owner))).amount);
    } catch {
      return 0;
    }
  };

  let nonceCounter = 1;
  const nextNonce = () => new BN(Date.now()).add(new BN(nonceCounter++));

  // Places an order on `listing` and returns its PDA.
  async function placeOrder(listing: PublicKey, who: Keypair = buyer, address = "1 Test St") {
    const nonce = nextNonce();
    const order = orderPda(listing, who.publicKey, nonce);
    await program.methods
      .placeOrder(nonce, sealAddress(address, carrierEnc.publicKey))
      .accountsPartial({
        buyer: who.publicKey,
        config: configPda,
        listing,
        order,
        usdcMint,
        buyerToken: ata(who.publicKey),
        vault: ata(order),
      })
      .signers([who])
      .rpc();
    return order;
  }

  const ship = (order: PublicKey) =>
    program.methods
      .markShipped([...createHash("sha256").update("TRACK-" + order.toBase58()).digest()])
      .accountsPartial({ sellerAuthority: seller.publicKey, order })
      .signers([seller])
      .rpc();

  const deliver = (order: PublicKey, signer: Keypair = carrier) =>
    program.methods
      .confirmDelivery()
      .accountsPartial({ carrier: signer.publicKey, config: configPda, order })
      .signers([signer])
      .rpc();

  const release = (order: PublicKey, caller: Keypair) =>
    program.methods
      .releasePayment()
      .accountsPartial({
        caller: caller.publicKey,
        config: configPda,
        seller: sellerPda(seller.publicKey),
        order,
        buyer: buyer.publicKey,
        sellerAuthority: seller.publicKey,
        usdcMint,
        sellerToken: ata(seller.publicKey),
        vault: ata(order),
      })
      .signers([caller])
      .rpc();

  let listing0: PublicKey; // active $25 listing used by most tests
  let listing1: PublicKey; // gets deactivated

  before(async () => {
    // Fund every actor with SOL for fees and rent.
    for (const kp of [carrier, seller, buyer, stranger]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }
    // A fake "USDC" with 6 decimals, minted by the admin for testing.
    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    otherMint = await createMint(connection, admin, admin.publicKey, null, 6);
    const buyerAta = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, buyer.publicKey);
    await mintTo(connection, admin, usdcMint, buyerAta.address, admin, 1_000_000_000); // 1,000 USDC
  });

  // =========================================================================
  describe("config", () => {
    it("initializes the marketplace config", async () => {
      await program.methods
        .initializeConfig(carrier.publicKey, [...carrierEnc.publicKey], new BN(SHIP_WINDOW), new BN(INSPECTION_WINDOW))
        .accountsPartial({ admin: admin.publicKey, config: configPda, usdcMint })
        .rpc();

      const cfg = await program.account.config.fetch(configPda);
      expect(cfg.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(cfg.carrier.toBase58()).to.equal(carrier.publicKey.toBase58());
      expect(cfg.usdcMint.toBase58()).to.equal(usdcMint.toBase58());
      expect(cfg.shipWindowSecs.toNumber()).to.equal(SHIP_WINDOW);
      expect(Buffer.from(cfg.carrierEncryptionKey)).to.deep.equal(Buffer.from(carrierEnc.publicKey));
    });

    it("cannot be initialized twice", async () => {
      await expectError(
        program.methods
          .initializeConfig(carrier.publicKey, [...carrierEnc.publicKey], new BN(1), new BN(1))
          .accountsPartial({ admin: admin.publicKey, config: configPda, usdcMint })
          .rpc(),
        "already in use"
      );
    });

    it("rejects config updates from non-admins", async () => {
      await expectError(
        program.methods
          .updateConfig(stranger.publicKey, stranger.publicKey, [...carrierEnc.publicKey], new BN(1), new BN(1))
          .accountsPartial({ admin: stranger.publicKey, config: configPda })
          .signers([stranger])
          .rpc(),
        "Unauthorized"
      );
    });

    it("rejects zero-length time windows", async () => {
      await expectError(
        program.methods
          .updateConfig(admin.publicKey, carrier.publicKey, [...carrierEnc.publicKey], new BN(0), new BN(5))
          .accountsPartial({ admin: admin.publicKey, config: configPda })
          .rpc(),
        "InvalidWindow"
      );
    });
  });

  // =========================================================================
  describe("sellers & listings", () => {
    it("registers a seller with a clean record", async () => {
      await program.methods
        .registerSeller("Glow Skincare")
        .accountsPartial({ authority: seller.publicKey, seller: sellerPda(seller.publicKey) })
        .signers([seller])
        .rpc();
      const s = await program.account.seller.fetch(sellerPda(seller.publicKey));
      expect(s.name).to.equal("Glow Skincare");
      expect(s.completedOrders.toNumber()).to.equal(0);
      expect(s.listingCount.toNumber()).to.equal(0);
    });

    it("rejects an empty seller name", async () => {
      await expectError(
        program.methods
          .registerSeller("   ")
          .accountsPartial({ authority: stranger.publicKey, seller: sellerPda(stranger.publicKey) })
          .signers([stranger])
          .rpc(),
        "InvalidSellerName"
      );
    });

    it("creates listings numbered 0, 1, …", async () => {
      const profile = sellerPda(seller.publicKey);
      listing0 = listingPda(profile, 0);
      listing1 = listingPda(profile, 1);
      for (const [l, title] of [
        [listing0, "Vitamin C serum"],
        [listing1, "LED face mask"],
      ] as const) {
        await program.methods
          .createListing(title, "https://example.com/img.jpg", USDC(25))
          .accountsPartial({ authority: seller.publicKey, seller: profile, listing: l })
          .signers([seller])
          .rpc();
      }
      const l0 = await program.account.listing.fetch(listing0);
      expect(l0.title).to.equal("Vitamin C serum");
      expect(l0.price.toNumber()).to.equal(25_000_000);
      expect(l0.active).to.equal(true);
      expect((await program.account.seller.fetch(profile)).listingCount.toNumber()).to.equal(2);
    });

    it("rejects a zero price", async () => {
      const profile = sellerPda(seller.publicKey);
      await expectError(
        program.methods
          .createListing("Free thing", "", new BN(0))
          .accountsPartial({ authority: seller.publicKey, seller: profile, listing: listingPda(profile, 2) })
          .signers([seller])
          .rpc(),
        "InvalidPrice"
      );
    });

    it("only the owner can pause a listing", async () => {
      await expectError(
        program.methods
          .setListingActive(false)
          .accountsPartial({ authority: stranger.publicKey, listing: listing1 })
          .signers([stranger])
          .rpc(),
        "Unauthorized"
      );
      await program.methods
        .setListingActive(false)
        .accountsPartial({ authority: seller.publicKey, listing: listing1 })
        .signers([seller])
        .rpc();
      expect((await program.account.listing.fetch(listing1)).active).to.equal(false);
    });
  });

  // =========================================================================
  describe("happy path: pay → ship → deliver → release", () => {
    let order: PublicKey;
    const ADDRESS = "Jane Doe, 2329 West Mall, Vancouver BC V6T 1Z4";

    it("escrows the buyer's USDC and stores only an encrypted address", async () => {
      const before = await balance(buyer.publicKey);
      order = await placeOrder(listing0, buyer, ADDRESS);

      expect(await balance(buyer.publicKey)).to.equal(before - 25_000_000);
      expect(await balance(order)).to.equal(25_000_000); // vault holds the money

      const o = await program.account.order.fetch(order);
      expect(o.status).to.deep.equal({ paid: {} });
      // The seller sees only ciphertext…
      expect(Buffer.from(o.encryptedAddress).toString("utf8")).to.not.include("Vancouver");
      // …but the carrier can decrypt it.
      expect(openAddress(Uint8Array.from(o.encryptedAddress), carrierEnc.secretKey)).to.equal(ADDRESS);
      // And a random key cannot.
      expect(openAddress(Uint8Array.from(o.encryptedAddress), nacl.box.keyPair().secretKey)).to.equal(null);
    });

    it("rejects shipping by anyone but the seller", async () => {
      await expectError(
        program.methods
          .markShipped(Array(32).fill(1))
          .accountsPartial({ sellerAuthority: stranger.publicKey, order })
          .signers([stranger])
          .rpc(),
        "Unauthorized"
      );
    });

    it("lets the seller mark it shipped", async () => {
      await ship(order);
      expect((await program.account.order.fetch(order)).status).to.deep.equal({ shipped: {} });
    });

    it("rejects delivery confirmation from anyone but the carrier", async () => {
      await expectError(deliver(order, seller), "Unauthorized");
    });

    it("carrier confirms delivery, starting the inspection window", async () => {
      await deliver(order);
      const o = await program.account.order.fetch(order);
      expect(o.status).to.deep.equal({ delivered: {} });
      expect(o.releaseAfter.toNumber()).to.be.greaterThan(o.deliveredAt.toNumber());
    });

    it("strangers can't release while the inspection window is open", async () => {
      await expectError(release(order, stranger), "InspectionWindowOpen");
    });

    it("buyer can release early; seller is paid and their record updates", async () => {
      await release(order, buyer);
      expect(await balance(seller.publicKey)).to.equal(25_000_000);
      const o = await program.account.order.fetch(order);
      expect(o.status).to.deep.equal({ completed: {} });
      const s = await program.account.seller.fetch(sellerPda(seller.publicKey));
      expect(s.completedOrders.toNumber()).to.equal(1);
      expect(s.totalVolume.toNumber()).to.equal(25_000_000);
      // Vault closed → its rent went back to the buyer.
      expect(await connection.getAccountInfo(ata(order))).to.equal(null);
    });

    it("cannot be paid out twice", async () => {
      await expectError(release(order, buyer), "Error");
    });
  });

  // =========================================================================
  describe("order guards", () => {
    it("rejects orders on paused listings", async () => {
      await expectError(placeOrder(listing1), "ListingInactive");
    });

    it("rejects a seller buying their own listing", async () => {
      const sellerAta = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, seller.publicKey);
      await mintTo(connection, admin, usdcMint, sellerAta.address, admin, 100_000_000);
      await expectError(placeOrder(listing0, seller), "SelfPurchase");
    });

    it("rejects paying with the wrong token", async () => {
      const wrong = await getOrCreateAssociatedTokenAccount(connection, admin, otherMint, buyer.publicKey);
      await mintTo(connection, admin, otherMint, wrong.address, admin, 100_000_000);
      const nonce = nextNonce();
      const order = orderPda(listing0, buyer.publicKey, nonce);
      await expectError(
        program.methods
          .placeOrder(nonce, sealAddress("x", carrierEnc.publicKey))
          .accountsPartial({
            buyer: buyer.publicKey,
            config: configPda,
            listing: listing0,
            order,
            usdcMint,
            buyerToken: wrong.address,
            vault: ata(order),
          })
          .signers([buyer])
          .rpc(),
        "ConstraintTokenMint"
      );
    });

    it("rejects an empty encrypted address", async () => {
      const nonce = nextNonce();
      const order = orderPda(listing0, buyer.publicKey, nonce);
      await expectError(
        program.methods
          .placeOrder(nonce, Buffer.alloc(0))
          .accountsPartial({
            buyer: buyer.publicKey,
            config: configPda,
            listing: listing0,
            order,
            usdcMint,
            buyerToken: ata(buyer.publicKey),
            vault: ata(order),
          })
          .signers([buyer])
          .rpc(),
        "InvalidEncryptedAddress"
      );
    });
  });

  // =========================================================================
  describe("seller cancels", () => {
    it("refunds the buyer in full and records the cancellation", async () => {
      const order = await placeOrder(listing0);
      const before = await balance(buyer.publicKey);

      // A stranger can't cancel someone else's order.
      await expectError(
        program.methods
          .cancelOrder()
          .accountsPartial({
            sellerAuthority: stranger.publicKey,
            config: configPda,
            seller: sellerPda(seller.publicKey),
            order,
            buyer: buyer.publicKey,
            usdcMint,
            buyerToken: ata(buyer.publicKey),
            vault: ata(order),
          })
          .signers([stranger])
          .rpc(),
        "Error"
      );

      await program.methods
        .cancelOrder()
        .accountsPartial({
          sellerAuthority: seller.publicKey,
          config: configPda,
          seller: sellerPda(seller.publicKey),
          order,
          buyer: buyer.publicKey,
          usdcMint,
          buyerToken: ata(buyer.publicKey),
          vault: ata(order),
        })
        .signers([seller])
        .rpc();

      expect(await balance(buyer.publicKey)).to.equal(before + 25_000_000);
      expect((await program.account.order.fetch(order)).status).to.deep.equal({ cancelled: {} });
      expect((await program.account.seller.fetch(sellerPda(seller.publicKey))).cancelledOrders.toNumber()).to.equal(1);
    });
  });

  // =========================================================================
  describe("seller never ships → anyone can refund", () => {
    let order: PublicKey;
    const refund = (o: PublicKey, caller: Keypair) =>
      program.methods
        .refundUnshipped()
        .accountsPartial({
          caller: caller.publicKey,
          config: configPda,
          seller: sellerPda(seller.publicKey),
          order: o,
          buyer: buyer.publicKey,
          usdcMint,
          buyerToken: ata(buyer.publicKey),
          vault: ata(o),
        })
        .signers([caller])
        .rpc();

    it("can't refund while the seller still has time", async () => {
      order = await placeOrder(listing0);
      await expectError(refund(order, stranger), "ShipDeadlineNotReached");
    });

    it("after the deadline the seller can no longer ship, and a stranger can trigger the refund", async () => {
      await sleep((SHIP_WINDOW + 2) * 1000);
      await expectError(ship(order), "ShipDeadlinePassed");

      const before = await balance(buyer.publicKey);
      await refund(order, stranger);
      expect(await balance(buyer.publicKey)).to.equal(before + 25_000_000);
      expect((await program.account.order.fetch(order)).status).to.deep.equal({ refunded: {} });
      expect(
        (await program.account.seller.fetch(sellerPda(seller.publicKey))).refundedUnshipped.toNumber()
      ).to.equal(1);
    });
  });

  // =========================================================================
  describe("disputes", () => {
    const resolve = (o: PublicKey, refundBuyer: boolean, signer: Keypair = admin) =>
      program.methods
        .resolveDispute(refundBuyer)
        .accountsPartial({
          admin: signer.publicKey,
          config: configPda,
          seller: sellerPda(seller.publicKey),
          order: o,
          buyer: buyer.publicKey,
          sellerAuthority: seller.publicKey,
          usdcMint,
          buyerToken: ata(buyer.publicKey),
          sellerToken: ata(seller.publicKey),
          vault: ata(o),
        })
        .signers(signer === admin ? [] : [signer])
        .rpc();

    const dispute = (o: PublicKey, signer: Keypair = buyer) =>
      program.methods
        .openDispute()
        .accountsPartial({ buyer: signer.publicKey, order: o })
        .signers([signer])
        .rpc();

    async function deliveredOrder() {
      const o = await placeOrder(listing0);
      await ship(o);
      await deliver(o);
      return o;
    }

    it("only the buyer can dispute", async () => {
      const o = await deliveredOrder();
      await expectError(dispute(o, stranger), "Unauthorized");
    });

    it("arbiter refunds the buyer when the item was fake", async () => {
      const o = await deliveredOrder();
      await dispute(o);
      expect((await program.account.order.fetch(o)).status).to.deep.equal({ disputed: {} });

      await expectError(resolve(o, true, stranger), "Unauthorized");

      const before = await balance(buyer.publicKey);
      await resolve(o, true);
      expect(await balance(buyer.publicKey)).to.equal(before + 25_000_000);
      expect((await program.account.seller.fetch(sellerPda(seller.publicKey))).disputesLost.toNumber()).to.equal(1);
    });

    it("arbiter pays the seller when the complaint is unfounded", async () => {
      const o = await deliveredOrder();
      await dispute(o);
      const before = await balance(seller.publicKey);
      await resolve(o, false);
      expect(await balance(seller.publicKey)).to.equal(before + 25_000_000);
      const s = await program.account.seller.fetch(sellerPda(seller.publicKey));
      expect(s.disputesWon.toNumber()).to.equal(1);
      expect(s.completedOrders.toNumber()).to.equal(2);
    });

    it("after the inspection window: no disputes, and anyone can release to the seller", async () => {
      const o = await deliveredOrder();
      await sleep((INSPECTION_WINDOW + 2) * 1000);
      await expectError(dispute(o), "InspectionWindowClosed");

      const before = await balance(seller.publicKey);
      await release(o, stranger);
      expect(await balance(seller.publicKey)).to.equal(before + 25_000_000);
    });

    it("final seller record reflects every outcome", async () => {
      const s = await program.account.seller.fetch(sellerPda(seller.publicKey));
      expect(s.completedOrders.toNumber()).to.equal(3);
      expect(s.refundedUnshipped.toNumber()).to.equal(1);
      expect(s.cancelledOrders.toNumber()).to.equal(1);
      expect(s.disputesLost.toNumber()).to.equal(1);
      expect(s.disputesWon.toNumber()).to.equal(1);
      expect(s.totalVolume.toNumber()).to.equal(75_000_000);
    });
  });
});
