//! Events (schema_version = 1). Each carries every key needed to rebuild the
//! receipt without trusting our frontend: market, pool, buyer, mints, amounts.

use anchor_lang::prelude::*;

#[event]
pub struct MarketCreated {
    pub schema_version: u8,
    pub market: Pubkey,
    pub id: u64,
    pub admin: Pubkey,
    pub collateral_mint: Pubkey,
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub close_time: i64,
}

#[event]
pub struct SetsSplit {
    pub schema_version: u8,
    pub market: Pubkey,
    pub owner: Pubkey,
    pub sets: u64,
    pub collateral_in: u64,
}

#[event]
pub struct MarketResolved {
    pub schema_version: u8,
    pub market: Pubkey,
    pub outcome: u8,
    pub resolved_at: i64,
}

#[event]
pub struct Redeemed {
    pub schema_version: u8,
    pub market: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    pub collateral_out: u64,
}

#[event]
pub struct TermsUpdated {
    pub schema_version: u8,
    pub pool: Pubkey,
    pub maker: Pubkey,
    pub terms_seq: u64,
    pub ask: u64,
    pub hold_rate: u64,
    pub max_hold_secs: u32,
    pub updated_at: i64,
}

#[event]
pub struct InventoryChanged {
    pub schema_version: u8,
    pub pool: Pubkey,
    /// Positive = deposit, negative = withdraw.
    pub delta: i64,
    pub available: u64,
    pub reserved: u64,
}

/// kind: 0 = immediate (buy_now), 1 = exercised hold.
#[event]
pub struct Filled {
    pub schema_version: u8,
    pub kind: u8,
    pub market: Pubkey,
    pub pool: Pubkey,
    /// Default pubkey for immediate buys.
    pub hold: Pubkey,
    pub buyer: Pubkey,
    pub maker: Pubkey,
    pub outcome_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub qty: u64,
    pub price: u64,
    pub total_paid: u64,
    pub terms_seq: u64,
    pub filled_at: i64,
}

#[event]
pub struct HoldCreated {
    pub schema_version: u8,
    pub market: Pubkey,
    pub pool: Pubkey,
    pub hold: Pubkey,
    pub buyer: Pubkey,
    pub maker: Pubkey,
    pub qty: u64,
    pub price: u64,
    pub fee_paid: u64,
    pub terms_seq: u64,
    pub created_at: i64,
    pub expires_at: i64,
}

#[event]
pub struct HoldReleased {
    pub schema_version: u8,
    pub pool: Pubkey,
    pub hold: Pubkey,
    pub buyer: Pubkey,
    pub qty: u64,
    /// Whoever sent the cleanup transaction (anyone may).
    pub caller: Pubkey,
    pub released_at: i64,
}
