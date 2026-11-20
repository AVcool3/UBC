//! Held Price — buy binary outcome shares now, or pay a disclosed fee to hold
//! an executable price for a few seconds and settle it atomically.
//!
//! The guarantee the chain enforces: while a hold is active, the held shares
//! sit in program custody and can only go to the hold's buyer at the held
//! price (before expiry) or back to the maker's available inventory (after
//! expiry). Nobody — including the maker and the app — can sell them to
//! someone else, reprice them, or withdraw them.
//!
//! See state.rs for units. Instructions:
//!   market: create_market, split, resolve, redeem
//!   maker:  open_pool, set_terms, deposit, withdraw, claim_proceeds
//!   buyer:  buy_now, hold, exercise
//!   anyone: release (after expiry)

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::PoolTerms;

declare_id!("32LnKdWnNk93W4C1pD4s3DjdTUAw4aGZZr6tbRMpw8e3");

#[program]
pub mod held_quote {
    use super::*;

    // ---- Market (fully collateralized YES/NO shares) ----
    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        market::handle_create_market(ctx, params)
    }
    pub fn split(ctx: Context<Split>, sets: u64) -> Result<()> {
        market::handle_split(ctx, sets)
    }
    pub fn resolve(ctx: Context<Resolve>, outcome: u8) -> Result<()> {
        market::handle_resolve(ctx, outcome)
    }
    pub fn redeem(ctx: Context<Redeem>, shares: u64) -> Result<()> {
        market::handle_redeem(ctx, shares)
    }

    // ---- Maker ----
    pub fn open_pool(ctx: Context<OpenPool>, terms: PoolTerms) -> Result<()> {
        pool::handle_open_pool(ctx, terms)
    }
    pub fn set_terms(ctx: Context<SetTerms>, terms: PoolTerms) -> Result<()> {
        pool::handle_set_terms(ctx, terms)
    }
    pub fn deposit(ctx: Context<MoveInventory>, shares: u64) -> Result<()> {
        pool::handle_deposit(ctx, shares)
    }
    pub fn withdraw(ctx: Context<MoveInventory>, shares: u64) -> Result<()> {
        pool::handle_withdraw(ctx, shares)
    }
    pub fn claim_proceeds(ctx: Context<ClaimProceeds>, amount: u64) -> Result<()> {
        pool::handle_claim_proceeds(ctx, amount)
    }

    // ---- Buyer ----
    pub fn buy_now(ctx: Context<BuyNow>, qty: u64, max_price: u64) -> Result<()> {
        trade::handle_buy_now(ctx, qty, max_price)
    }
    pub fn hold(
        ctx: Context<CreateHold>,
        nonce: u64,
        qty: u64,
        hold_secs: u32,
        max_price: u64,
        max_fee: u64,
    ) -> Result<()> {
        trade::handle_hold(ctx, nonce, qty, hold_secs, max_price, max_fee)
    }
    pub fn exercise(ctx: Context<Exercise>) -> Result<()> {
        trade::handle_exercise(ctx)
    }

    // ---- Anyone ----
    pub fn release(ctx: Context<Release>) -> Result<()> {
        trade::handle_release(ctx)
    }
}
