/**
 * Address privacy.
 *
 * The buyer's shipping address is encrypted IN THE BROWSER to the carrier's
 * X25519 public key (stored on-chain in Config). The ciphertext is what goes
 * on-chain, so the seller — and anyone reading the blockchain — sees only
 * random bytes. Only the carrier's secret key can open it.
 *
 * Format (must match contracts/tests/ghost_checkout.ts):
 *   [ephemeral public key: 32 bytes][nonce: 24 bytes][NaCl box ciphertext]
 */
import nacl from "tweetnacl";

/** Max plaintext bytes so the sealed blob fits the 256-byte on-chain limit (256 - 32 - 24 - 16). */
export const MAX_ADDRESS_BYTES = 184;

export function sealAddress(address: string, carrierPublicKey: Uint8Array): Uint8Array {
  const message = new TextEncoder().encode(address);
  if (message.length > MAX_ADDRESS_BYTES) {
    throw new Error(`Address is too long (${message.length}/${MAX_ADDRESS_BYTES} bytes)`);
  }
  // A fresh throwaway keypair per order, so two orders can't be linked by key.
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(message, nonce, carrierPublicKey, ephemeral.secretKey);

  const sealed = new Uint8Array(32 + 24 + box.length);
  sealed.set(ephemeral.publicKey, 0);
  sealed.set(nonce, 32);
  sealed.set(box, 56);
  return sealed;
}

/** Carrier-side: returns the address, or null if this key can't open it. */
export function openAddress(sealed: Uint8Array, carrierSecretKey: Uint8Array): string | null {
  if (sealed.length < 56 + nacl.box.overheadLength) return null;
  const opened = nacl.box.open(sealed.slice(56), sealed.slice(32, 56), sealed.slice(0, 32), carrierSecretKey);
  return opened ? new TextDecoder().decode(opened) : null;
}

/** sha256 of a tracking number, so the chain proves which parcel without revealing it. */
export async function sha256Bytes(text: string): Promise<number[]> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()));
  return Array.from(new Uint8Array(digest));
}
