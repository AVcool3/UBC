//! On-chain account layouts.
//!
//! Every account is a PDA (program-derived address), so its address can be
//! recomputed from its seeds by anyone — the frontend uses the same seeds in
//! `frontend/src/lib/pda.ts`. If you change a seed here, change it there too.

use anchor_lang::prelude::*;

// ---------------------------------------------------------------------------
// Size limits. Strings and byte vectors on Solana need a fixed max size so we
// know how much rent-paid space to allocate up front.
// ---------------------------------------------------------------------------
pub const MAX_SELLER_NAME_LEN: usize = 32;
pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_IMAGE_URL_LEN: usize = 200;
/// Sealed-box ciphertext of the buyer's shipping address
/// (32-byte ephemeral key + 24-byte nonce + 16-byte MAC + up to 184 bytes of text).
pub const MAX_ENCRYPTED_ADDRESS_LEN: usize = 256;

// PDA seed prefixes.
pub const CONFIG_SEED: &[u8] = b"config";
pub const SELLER_SEED: &[u8] = b"seller";
pub const LISTING_SEED: &[u8] = b"listing";
pub const ORDER_SEED: &[u8] = b"order";

/// Global marketplace settings. One per deployment, seeds = ["config"].
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Can update config and is the arbiter that resolves disputes.
    pub admin: Pubkey,
    /// The shipping carrier's signing key. Only this key can mark an order delivered.
    pub carrier: Pubkey,
    /// The carrier's X25519 *encryption* public key. Buyers encrypt their address
    /// to this key in the browser, so only the carrier can read it — never the seller.
    pub carrier_encryption_key: [u8; 32],
    /// The stablecoin every order is paid in (USDC on devnet/mainnet).
    pub usdc_mint: Pubkey,
    /// Seconds a seller has to ship after payment before the buyer can be auto-refunded.
    pub ship_window_secs: i64,
    /// Seconds after delivery during which the buyer can open a dispute
    /// (e.g. "it's counterfeit"). After this, anyone can release payment to the seller.
    pub inspection_window_secs: i64,
    pub bump: u8,
}

/// A seller's public profile and *un-fakeable* track record.
/// seeds = ["seller", authority]
///
/// The counters below are only ever changed by order outcomes inside this
/// program, so a seller can't buy fake reviews or delete bad ones.
#[account]
#[derive(InitSpace)]
pub struct Seller {
    /// Wallet that owns this seller profile.
    pub authority: Pubkey,
    #[max_len(MAX_SELLER_NAME_LEN)]
    pub name: String,
    /// How many listings this seller has created (also the next listing index).
    pub listing_count: u64,
    /// Orders that completed and paid the seller.
    pub completed_orders: u64,
    /// Orders auto-refunded because the seller never shipped in time.
    pub refunded_unshipped: u64,
    /// Orders the seller cancelled themselves before shipping.
    pub cancelled_orders: u64,
    /// Disputes the arbiter decided in the buyer's favour.
    pub disputes_lost: u64,
    /// Disputes the arbiter decided in the seller's favour.
    pub disputes_won: u64,
    /// Total USDC (base units, 6 decimals) the seller has been paid through escrow.
    pub total_volume: u64,
    pub joined_at: i64,
    pub bump: u8,
}

/// A product for sale. seeds = ["listing", seller_profile, index_le_bytes]
#[account]
#[derive(InitSpace)]
pub struct Listing {
    /// The Seller PDA this listing belongs to.
    pub seller: Pubkey,
    /// The seller's wallet (denormalised so the frontend can filter cheaply).
    pub seller_authority: Pubkey,
    pub index: u64,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,
    #[max_len(MAX_IMAGE_URL_LEN)]
    pub image_url: String,
    /// Price in USDC base units (1 USDC = 1_000_000).
    pub price: u64,
    /// Inactive listings can't be bought.
    pub active: bool,
    /// Number of orders placed on this listing.
    pub orders_placed: u64,
    pub created_at: i64,
    pub bump: u8,
}

/// Where an order is in its lifecycle.
///
///   Paid ──mark_shipped──► Shipped ──confirm_delivery──► Delivered ──release──► Completed
///    │                                                      │
///    ├─refund_unshipped (deadline passed)──► Refunded        └─open_dispute──► Disputed
///    └─cancel_order (seller)──────────────► Cancelled                           │
///                                                         resolve_dispute ──────┘──► Refunded / Completed
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OrderStatus {
    Paid,
    Shipped,
    Delivered,
    Disputed,
    Completed,
    Refunded,
    Cancelled,
}

/// One purchase. seeds = ["order", listing, buyer, nonce_le_bytes]
/// The USDC sits in this PDA's associated token account (the "vault") until
/// the order is completed or refunded.
#[account]
#[derive(InitSpace)]
pub struct Order {
    pub buyer: Pubkey,
    /// The seller's wallet (where payment goes).
    pub seller_authority: Pubkey,
    pub listing: Pubkey,
    /// Client-chosen number so one buyer can place many orders on one listing.
    pub nonce: u64,
    /// Escrowed amount in USDC base units.
    pub amount: u64,
    pub status: OrderStatus,
    pub created_at: i64,
    /// Seller must ship before this unix timestamp.
    pub ship_deadline: i64,
    pub shipped_at: i64,
    pub delivered_at: i64,
    /// After this timestamp anyone can release payment to the seller.
    pub release_after: i64,
    /// sha256 of the carrier tracking number — proves which parcel was shipped
    /// without publishing the tracking number itself.
    pub tracking_hash: [u8; 32],
    /// The buyer's shipping address, encrypted to the carrier's key.
    /// The seller only ever sees this unreadable blob.
    #[max_len(MAX_ENCRYPTED_ADDRESS_LEN)]
    pub encrypted_address: Vec<u8>,
    pub bump: u8,
}
