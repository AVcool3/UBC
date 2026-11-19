/** Turns Anchor / RPC errors into one readable line for API responses. */
export function friendlyServerError(err: unknown): string {
  const e = err as { error?: { errorMessage?: string }; message?: string };
  if (e?.error?.errorMessage) return e.error.errorMessage;
  const msg = String(e?.message ?? err);
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}
