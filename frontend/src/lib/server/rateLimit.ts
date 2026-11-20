/**
 * Tiny in-memory rate limiter for public API routes (per server instance).
 * Not a security boundary on its own, but it stops a single client from
 * hammering the faucet or a third-party API through us.
 */
const hits = new Map<string, number[]>();

/** Returns true if `key` may proceed: at most `max` calls per `windowMs`. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear(); // bound memory
  return true;
}

/** Best-effort client identity behind Vercel's proxy. */
export function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}
