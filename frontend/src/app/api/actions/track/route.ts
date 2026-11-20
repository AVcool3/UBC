/**
 * POST /api/actions/track?order=<order>
 * The "Track my order" button shown on the Blink after a purchase. Per the
 * Actions spec, an `external-link` action answers with the URL to open, here the
 * buyer's orders page with the new order highlighted.
 */
import { PublicKey } from "@solana/web3.js";
import { actionError, actionJson, actionPreflight, publicOrigin } from "@/lib/server/actions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const order = new URL(req.url).searchParams.get("order") ?? "";
  try {
    new PublicKey(order); // validate before echoing it into a URL
  } catch {
    return actionError("Unknown order.");
  }
  return actionJson({
    type: "external-link",
    externalLink: `${publicOrigin(req)}/orders?new=${order}`,
  });
}

export const OPTIONS = actionPreflight;
