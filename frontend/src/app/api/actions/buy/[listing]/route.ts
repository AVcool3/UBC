/**
 * Blink: "buy this product privately", straight from a social post.
 *
 *   GET  /api/actions/buy/<listing>
 *        → the card: product image, price, seller's on-chain track record,
 *          a name + address form, and a "Buy privately" button.
 *   POST /api/actions/buy/<listing>   body { account, data: { name, address } }
 *        → a place_order transaction for the buyer's wallet to sign.
 *
 * Privacy note (also in the README): on the website the address is sealed in
 * your browser. A Blink card can't run our code, so here the address reaches
 * this server, is sealed to the carrier's key immediately, and only the sealed
 * bytes leave. Our code never stores or logs it (blink clients do put form values
 * in the request URL, so keep hosting access logs private). Same on-chain result.
 *
 * Demo mode extra: if the buyer's wallet has no test USDC or no SOL, the faucet
 * key adds them INSIDE the same transaction (and pays the fee), so a judge can
 * buy from a Blink with a brand-new devnet wallet. The faucet signs first; the
 * buyer's wallet adds the only other signature.
 */
import { BN } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { makeProgram } from "@/lib/core";
import { MAX_ADDRESS_BYTES, sealAddress } from "@/lib/crypto";
import { usd } from "@/lib/format";
import { configPda, orderPda, sellerPda, usdcAta } from "@/lib/pda";
import { trustLabel, trustOf } from "@/lib/trust";
import type { ConfigAccount, ListingAccount, SellerAccount } from "@/lib/types";
import { ActionProblem, actionError, actionJson, actionPreflight, publicOrigin } from "@/lib/server/actions";
import { demoEnabled, serverConnection } from "@/lib/server/demo";
import { friendlyServerError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo sponsorship amounts (devnet play money).
const USDC_DRIP = 20_000_000; // 20 test USDC
const SOL_DRIP = 0.02 * LAMPORTS_PER_SOL; // covers order + vault rent (~0.006 SOL) with room to spare
const SOL_SPONSOR_BELOW = 0.01 * LAMPORTS_PER_SOL;

type Params = { params: Promise<{ listing: string }> };

/** Loads everything the card and the transaction need. Throws ActionProblem for bad input. */
async function loadListing(listingParam: string) {
  let listingKey: PublicKey;
  try {
    listingKey = new PublicKey(listingParam);
  } catch {
    throw new ActionProblem("That isn't a valid listing link.", 404);
  }
  const program = makeProgram(serverConnection());
  const [config, listing] = await Promise.all([
    program.account.config.fetchNullable(configPda()),
    program.account.listing.fetchNullable(listingKey),
  ]);
  if (!config) throw new ActionProblem("The marketplace isn't set up on this network yet.", 503);
  if (!listing) throw new ActionProblem("This product doesn't exist (or was listed on another network).", 404);
  const seller = await program.account.seller.fetchNullable(sellerPda(listing.sellerAuthority));
  return { program, config, listing, listingKey, seller };
}

/** "120" → "2 minutes", "604800" → "7 days". */
function humanWindow(secs: number): string {
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (secs >= size) {
      const n = Math.round(secs / size);
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return `${secs} seconds`;
}

/** The card text. Risky sellers get a warning BEFORE the buyer pays. */
function describe(config: ConfigAccount, listing: ListingAccount, seller: SellerAccount | null): string {
  const who = seller ? `Sold by ${seller.name} (${trustLabel(seller)}).` : "Sold by an unregistered seller.";
  const warning =
    seller && trustOf(seller).level === "bad"
      ? ` ⚠ This seller failed to ship or lost a dispute on ${trustOf(seller).bad} of ${trustOf(seller).total} orders — escrow still protects you.`
      : "";
  return (
    `${who}${warning} Pay in USDC into an on-chain escrow. Your address is encrypted to the carrier, ` +
    `so the seller only ever sees an order code. Auto-refund if it doesn't ship within ${humanWindow(config.shipWindowSecs.toNumber())}.`
  );
}

// ---------------------------------------------------------------------------
// GET — the card
// ---------------------------------------------------------------------------
export async function GET(req: Request, { params }: Params) {
  const { listing: listingParam } = await params;
  try {
    const { config, listing, listingKey, seller } = await loadListing(listingParam);
    const origin = publicOrigin(req);
    const price = usd(listing.price);
    return actionJson({
      type: "action",
      // Seller's photo if they gave one, otherwise our generated product art.
      icon: listing.imageUrl || `${origin}/api/actions/art/${listingKey.toBase58()}`,
      title: `${listing.title} · ${price}`,
      description: describe(config, listing, seller),
      label: `Buy privately · ${price}`,
      // An inactive listing still renders, but the button is greyed out.
      disabled: !listing.active,
      ...(listing.active ? {} : { error: { message: "The seller has paused this listing." } }),
      links: {
        actions: [
          {
            type: "transaction",
            label: `Buy privately · ${price}`,
            // Clients fill {name}/{address} from the form; newer clients also send them as `data`.
            href: `/api/actions/buy/${listingKey.toBase58()}?name={name}&address={address}`,
            parameters: [
              { name: "name", label: "Full name", required: true },
              {
                name: "address",
                type: "textarea",
                label: "Street, city, postal code, country",
                required: true,
              },
            ],
          },
        ],
      },
    });
  } catch (err) {
    return problemResponse(err);
  }
}

// ---------------------------------------------------------------------------
// POST — build the transaction
// ---------------------------------------------------------------------------
export async function POST(req: Request, { params }: Params) {
  const { listing: listingParam } = await params;
  try {
    // ---- Read + validate input ----
    const body = (await req.json().catch(() => ({}))) as { account?: string; data?: Record<string, string | string[]> };
    let buyer: PublicKey;
    try {
      buyer = new PublicKey(body.account ?? "");
    } catch {
      throw new ActionProblem("Invalid wallet address.");
    }
    const query = new URL(req.url).searchParams;
    const field = (k: string) => {
      const v = body.data?.[k] ?? query.get(k) ?? "";
      return (Array.isArray(v) ? v.join(" ") : v).trim();
    };
    const name = field("name");
    // Newlines from the textarea become ", " so the carrier sees one tidy line.
    const address = field("address").replace(/\s*\n+\s*/g, ", ");
    // Unfilled template placeholders like "{name}" mean the client didn't send the form.
    if (!name || !address || name === "{name}" || address === "{address}") {
      throw new ActionProblem("Please enter your name and shipping address.");
    }
    const fullAddress = `${name}, ${address}`;
    if (new TextEncoder().encode(fullAddress).length > MAX_ADDRESS_BYTES) {
      throw new ActionProblem(`Address is too long (max ${MAX_ADDRESS_BYTES} characters).`);
    }

    const { program, config, listing, listingKey } = await loadListing(listingParam);
    if (!listing.active) throw new ActionProblem("The seller has paused this listing.");
    if (listing.sellerAuthority.equals(buyer)) throw new ActionProblem("You can't buy your own listing.");

    // ---- Seal the address right away; only ciphertext goes any further ----
    const sealed = sealAddress(fullAddress, Uint8Array.from(config.carrierEncryptionKey));

    // ---- Demo sponsorship (devnet test USDC + gas) ----
    const conn = serverConnection();
    const sponsor = await demoSponsor(config);
    const buyerToken = usdcAta(config.usdcMint, buyer);
    const [solBalance, usdcBalance] = await Promise.all([
      conn.getBalance(buyer),
      getAccount(conn, buyerToken).then((a) => Number(a.amount)).catch(() => 0),
    ]);
    const price = listing.price.toNumber();
    const needsUsdc = usdcBalance < price;
    const needsSol = solBalance < SOL_SPONSOR_BELOW;
    if (needsUsdc && !sponsor) {
      throw new ActionProblem(`You need ${usd(price)} USDC on ${process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"} to buy this.`);
    }
    // If we top up SOL, the faucet also pays the fee (a fresh wallet can't).
    const feePayer = needsSol && sponsor ? sponsor.publicKey : buyer;

    const tx = new Transaction();
    if (needsSol && sponsor) {
      tx.add(SystemProgram.transfer({ fromPubkey: sponsor.publicKey, toPubkey: buyer, lamports: SOL_DRIP }));
    }
    // place_order needs the buyer's USDC account to exist; idempotent = no-op if it does.
    tx.add(createAssociatedTokenAccountIdempotentInstruction(feePayer, buyerToken, buyer, config.usdcMint));
    if (needsUsdc && sponsor) {
      tx.add(createMintToInstruction(config.usdcMint, buyerToken, sponsor.publicKey, USDC_DRIP));
    }

    // ---- The actual purchase (same instruction the website sends) ----
    const nonce = new BN(Date.now());
    const order = orderPda(listingKey, buyer, nonce);
    tx.add(
      await program.methods
        .placeOrder(nonce, Buffer.from(sealed))
        .accountsPartial({
          buyer,
          config: configPda(),
          listing: listingKey,
          order,
          usdcMint: config.usdcMint,
          buyerToken,
          vault: usdcAta(config.usdcMint, order),
        })
        .instruction()
    );

    tx.feePayer = feePayer;
    tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
    // The faucet signs only if one of its instructions is in this transaction.
    if (sponsor && (needsSol || needsUsdc)) tx.partialSign(sponsor);

    const origin = publicOrigin(req);
    const sponsoredNote = needsUsdc && sponsor ? " (Demo: $20 test USDC was added to your wallet in the same transaction.)" : "";
    return actionJson({
      type: "transaction",
      transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      message: `Paid ${usd(price)} into escrow. The seller only sees order ${order.toBase58().slice(0, 6).toUpperCase()}.${sponsoredNote}`,
      // After it confirms, the card turns into a "Track my order" button.
      links: {
        next: {
          type: "inline",
          action: {
            type: "action",
            icon: listing.imageUrl || `${origin}/api/actions/art/${listingKey.toBase58()}`,
            title: `Paid · ${listing.title}`,
            description:
              "Your USDC is locked in escrow. The seller ships to an order code, the carrier delivers to your sealed address, " +
              "and the money is released only after delivery.",
            label: "Track my order",
            links: {
              actions: [{ type: "external-link", label: "Track my order", href: `/api/actions/track?order=${order.toBase58()}` }],
            },
          },
        },
      },
    });
  } catch (err) {
    return problemResponse(err);
  }
}

export const OPTIONS = actionPreflight;

/**
 * The demo faucet key, but only when demo mode is on AND it really is the
 * test-USDC mint authority. On a real-USDC deployment this returns null and
 * buyers simply need their own USDC.
 */
async function demoSponsor(config: ConfigAccount): Promise<Keypair | null> {
  if (!demoEnabled() || !process.env.DEMO_FAUCET_KEY) return null;
  const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.DEMO_FAUCET_KEY)));
  const mint = await getMint(serverConnection(), config.usdcMint);
  return mint.mintAuthority?.equals(faucet.publicKey) ? faucet : null;
}

/** Expected problems → their status; anything else → 500 with a readable message. */
function problemResponse(err: unknown) {
  if (err instanceof ActionProblem) return actionError(err.message, err.status);
  console.error("blink error", (err as Error)?.message);
  return actionError(friendlyServerError(err), 500);
}
