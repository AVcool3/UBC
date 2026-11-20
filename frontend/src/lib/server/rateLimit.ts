/**
 * Tiny in-memory rate limiter for public API routes.
 * Per server instance (serverless instances don't share it), so it's a speed
 * bump, not a security boundary: it stops one client from hammering the faucet
 * or a third-party API through us. A shared store (e.g. Redis) would be the fix.
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
  if (hits.size > 5_000) {
    // Bound memory by dropping idle keys only (clearing everything would reset every client's limit).
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

/** Best-effort client identity behind Vercel's proxy. */
export function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}
