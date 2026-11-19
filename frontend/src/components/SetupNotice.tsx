"use client";
/** Shown when the program is deployed but `npm run init-config` hasn't been run yet. */
import { CLUSTER, PROGRAM_ID } from "@/lib/contracts";
import { Card } from "./ui";

export function SetupNotice() {
  return (
    <Card className="border-warn/40">
      <p className="font-semibold text-warn">Marketplace not initialized on {CLUSTER}</p>
      <p className="mt-2 text-sm text-muted">
        No Config account was found for program <span className="font-mono">{PROGRAM_ID.toBase58()}</span>. Deploy the program
        and run <code className="rounded bg-surface-2 px-1">npm run init-config</code> in <code>/contracts</code>, then check{" "}
        <code>NEXT_PUBLIC_PROGRAM_ID</code> and <code>NEXT_PUBLIC_SOLANA_RPC_URL</code> in <code>frontend/.env.local</code>.
      </p>
    </Card>
  );
}
