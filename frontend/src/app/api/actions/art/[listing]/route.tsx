/**
 * GET /api/actions/art/<listing> → PNG product card for the Blink.
 *
 * Blink clients need a real image URL, and most demo listings have no photo,
 * so we draw the same emoji + gradient art the shop uses (lib/art.ts), with the
 * price and a "private checkout" badge. Rendered with next/og (no browser needed).
 */
import { PublicKey } from "@solana/web3.js";
import { ImageResponse } from "next/og";
import { emojiFor, gradientFor } from "@/lib/art";
import { makeProgram } from "@/lib/core";
import { usd } from "@/lib/format";
import { serverConnection } from "@/lib/server/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = 800; // square, which is what Blink cards display best

export async function GET(_req: Request, { params }: { params: Promise<{ listing: string }> }) {
  const { listing: listingParam } = await params;
  let title = "Ghost Checkout";
  let price = "";
  try {
    const listing = await makeProgram(serverConnection()).account.listing.fetchNullable(new PublicKey(listingParam));
    if (listing) {
      title = listing.title;
      price = usd(listing.price);
    }
  } catch {
    // Bad key or RPC hiccup: still return a generic card rather than a broken image.
  }
  const [c1, c2, c3] = gradientFor(title).hex;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 48,
          color: "white",
          backgroundImage: `linear-gradient(135deg, ${c1}, ${c2} 50%, ${c3})`,
        }}
      >
        {/* Top badge */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              padding: "12px 24px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.35)",
            }}
          >
            👻 Ghost Checkout · private escrow
          </div>
        </div>

        {/* Product emoji */}
        <div style={{ display: "flex", justifyContent: "center", fontSize: 260 }}>{emojiFor(title)}</div>

        {/* Title + price */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          {price && <div style={{ display: "flex", fontSize: 72, fontWeight: 800, marginTop: 8 }}>{price}</div>}
          <div style={{ display: "flex", fontSize: 28, opacity: 0.9, marginTop: 4 }}>
            USDC on Solana · the seller never sees your address
          </div>
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE, emoji: "twemoji" }
  );
  // Let clients/CDNs cache the picture for a few minutes.
  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  image.headers.set("Access-Control-Allow-Origin", "*");
  return image;
}
