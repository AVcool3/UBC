/**
 * GET /actions.json — tells Blink clients which website URLs are Actions.
 *
 * With this, sharing the normal product page link https://<site>/buy/<listing>
 * on X unfurls into a buy card (for wallets that support Blinks), while people
 * without a Blink client just land on the regular product page.
 */
import { actionJson, actionPreflight } from "@/lib/server/actions";

export const dynamic = "force-static";

export function GET() {
  return actionJson({
    rules: [
      // Human product page → its Action API.
      { pathPattern: "/buy/*", apiPath: "/api/actions/buy/*" },
      // The Action API itself is also directly usable.
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  });
}

export const OPTIONS = actionPreflight;
