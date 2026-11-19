/**
 * Prints every environment variable the hosted app needs for demo mode and
 * writes them to keys/vercel.env (git-ignored). Paste them into
 * Vercel → Project → Settings → Environment Variables.
 *
 *   npm run demo-env
 *
 * Run after init-config (with USDC_MINT=create) and seed-demo.
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

  // Demo sellers that ship on autopilot. FlashDeals99 is left out on purpose:
  // it never ships, so visitors can see the automatic refund.
  const sellers = `[${read("seller-glow.json")},${read("seller-gadget.json")}]`;

  const lines = [
    `NEXT_PUBLIC_SOLANA_RPC_URL=${rpc}`,
    `NEXT_PUBLIC_SOLANA_CLUSTER=${cluster}`,
    `NEXT_PUBLIC_PROGRAM_ID=${program.programId.toBase58()}`,
    `NEXT_PUBLIC_DEMO_MODE=true`,
    `DEMO_FAUCET_KEY=${read("faucet.json")}`,
    `DEMO_CARRIER_KEY=${read("carrier.json")}`,
    `DEMO_SELLER_KEYS=${sellers}`,
    `DEMO_ARBITER_KEY=${JSON.stringify(JSON.parse(fs.readFileSync(adminFile, "utf8")))}`,
  ];
  const out = path.join(KEYS_DIR, "vercel.env");
  fs.writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`Wrote ${out}\n`);
  console.log(lines.map((l) => l.replace(/=(\[.{20}).*$/, "=$1…]")).join("\n"));
}

main();
