//! Events emitted on every state change.
//!
//! Solana has no "indexed topics" like EVM logs; instead events are written to
//! the transaction log and indexers filter on the Pubkey fields. Each event
//! carries every key someone might want to filter by (order, buyer, seller…).

use anchor_lang::prelude::*;

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub carrier: Pubkey,
    pub usdc_mint: Pubkey,
    pub ship_window_secs: i64,
    pub inspection_window_secs: i64,
}

#[event]
pub struct SellerRegistered {
    pub seller: Pubkey,
    pub authority: Pubkey,
    pub name: String,
}

#[event]
pub struct ListingCreated {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
    pub title: String,
}

#[event]
pub struct ListingStatusChanged {
    pub listing: Pubkey,
    pub active: bool,
}

#[event]
pub struct OrderPlaced {
    pub order: Pubkey,
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub ship_deadline: i64,
}

#[event]
pub struct OrderShipped {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub tracking_hash: [u8; 32],
}

#[event]
pub struct OrderDelivered {
    pub order: Pubkey,
    pub carrier: Pubkey,
    pub release_after: i64,
}

#[event]
pub struct PaymentReleased {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub released_by: Pubkey,
}

#[event]
pub struct OrderRefunded {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    /// 0 = seller missed ship deadline, 1 = seller cancelled, 2 = dispute lost by seller
    pub reason: u8,
}

#[event]
pub struct DisputeOpened {
    pub order: Pubkey,
    pub buyer: Pubkey,
}

#[event]
pub struct DisputeResolved {
    pub order: Pubkey,
    pub refunded_buyer: bool,
}
