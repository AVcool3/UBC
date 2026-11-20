/**
 * Prints every environment variable the hosted app needs for demo mode and
 * writes them to keys/vercel.env (git-ignored). Paste them into
 * Vercel → Project → Settings → Environment Variables.
 *
 *   npm run demo-env
 *
 * Run after seed-market.
 * These are TEST-NETWORK keys only. Never reuse them for real funds.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { getProgram, getProvider, isLocal, KEYS_DIR } from "./common";

const read = (file: string) => {
  const full = path.join(KEYS_DIR, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${full}. Run init-config and seed-demo first.`);
  return JSON.stringify(JSON.parse(fs.readFileSync(full, "utf8")));
};

function main() {
  const provider = getProvider();
  const program = getProgram(provider);
  const rpc = provider.connection.rpcEndpoint;
  const cluster = isLocal(rpc) ? "localnet" : rpc.includes("devnet") ? "devnet" : "mainnet-beta";
  const adminFile = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");

  // Program, market and mints are pinned in frontend/src/deployment.json (written by
  // seed-market), so only the RPC and the server-side demo keys go in the environment.
  const lines = [
    `NEXT_PUBLIC_SOLANA_RPC_URL=${rpc}`,
    `NEXT_PUBLIC_SOLANA_CLUSTER=${cluster}`,
    `NEXT_PUBLIC_DEMO_MODE=true`,
    `DEMO_FAUCET_KEY=${read("faucet.json")}`,
    `DEMO_MAKER_KEY=${read("seller-glow.json")}`,
    `DEMO_ARBITER_KEY=${JSON.stringify(JSON.parse(fs.readFileSync(adminFile, "utf8")))}`,
  ];
  void program;
  const out = path.join(KEYS_DIR, "vercel.env");
  fs.writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`Wrote ${out}\n`);
  console.log(lines.map((l) => l.replace(/=(\[.{20}).*$/, "=$1…]")).join("\n"));
}

main();
