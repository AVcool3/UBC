/**
 * Copies the program's IDL (JSON description of every instruction/account)
 * and its TypeScript types into the frontend. Run after every `anchor build`
 * that changes the program's interface:
 *
 *   npm run export-idl
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");
const dest = path.join(root, "..", "frontend", "src", "idl");
fs.mkdirSync(dest, { recursive: true });

fs.copyFileSync(path.join(root, "target/idl/ghost_checkout.json"), path.join(dest, "ghost_checkout.json"));
fs.copyFileSync(path.join(root, "target/types/ghost_checkout.ts"), path.join(dest, "ghost_checkout.ts"));
console.log(`IDL + types copied to ${dest}`);
