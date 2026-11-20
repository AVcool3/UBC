/**
 * "Demo Wallet": a no-install wallet for judges and first-time users.
 *
 * It creates a Solana keypair in the browser and keeps it in localStorage, so
 * the same wallet (and its orders) survive page reloads. No extension, no seed
 * phrase. DEVNET ONLY — never put real money in a browser-stored key.
 */
import {
  BaseSignerWalletAdapter,
  isVersionedTransaction,
  WalletNotConnectedError,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { Keypair, type PublicKey } from "@solana/web3.js";

export const DemoWalletName = "Demo Wallet (no install)" as WalletName<"Demo Wallet (no install)">;
const STORAGE_KEY = "held-demo-wallet";

// Simple icon (inline SVG so there are no extra files).
const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#8b6cff"/><path d="M32 12c-10 0-17 8-17 18v20l5-4 4 4 4-4 4 4 4-4 4 4 4-4 5 4V30c0-10-7-18-17-18z" fill="#fff"/><circle cx="26" cy="30" r="3.5" fill="#8b6cff"/><circle cx="38" cy="30" r="3.5" fill="#8b6cff"/></svg>'
      )
    : "");

function loadOrCreateKeypair(): Keypair {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved)));
  } catch {
    /* storage blocked or corrupt — fall through and make a new one */
  }
  const kp = Keypair.generate();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
  } catch {
    /* private mode: wallet still works for this tab */
  }
  return kp;
}

export class DemoWalletAdapter extends BaseSignerWalletAdapter {
  name = DemoWalletName;
  url = "https://github.com/AVcool3/UBC";
  icon = ICON;
  supportedTransactionVersions = new Set(["legacy", 0] as const);

  private _keypair: Keypair | null = null;

  get connecting() {
    return false;
  }
  get publicKey(): PublicKey | null {
    return this._keypair?.publicKey ?? null;
  }
  get readyState() {
    return typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.Loadable;
  }

  async connect(): Promise<void> {
    this._keypair = loadOrCreateKeypair();
    this.emit("connect", this._keypair.publicKey);
  }

  async disconnect(): Promise<void> {
    this._keypair = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>>(tx: T): Promise<T> {
    const kp = this._keypair;
    if (!kp) throw new WalletNotConnectedError();
    if (isVersionedTransaction(tx)) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  }
}
