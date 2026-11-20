/**
 * Links for sharing a listing as a Blink (Solana Action).
 *
 *  productUrl  https://<site>/buy/<listing>
 *      The link a seller posts. Blink-aware wallets on X read /actions.json and
 *      unfurl it into a buy card; everyone else gets the normal product page.
 *  actionUrl   https://<site>/api/actions/buy/<listing>
 *      The raw Action API (what the card talks to).
 *  dialToUrl   https://dial.to/?action=solana-action:<actionUrl>
 *      Dialect's hosted Blink viewer. Works in any browser with a wallet, no
 *      registration needed, so it's the easiest way to show the Blink in a demo.
 */
export function blinkLinks(origin: string, listing: string) {
  const productUrl = `${origin}/buy/${listing}`;
  const actionUrl = `${origin}/api/actions/buy/${listing}`;
  const dialToUrl = `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl}`)}`;
  return { productUrl, actionUrl, dialToUrl };
}

/** Pre-filled "post on X" link a seller can use to drop the product into their feed. */
export function tweetUrl(text: string, url: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
