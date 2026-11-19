//! # Ghost Checkout
//!
//! Private, escrowed checkout for social commerce (TikTok Shop / Temu style).
//!
//! - Buyers pay USDC into an escrow vault that only this program controls.
//! - Sellers never see the buyer's name, card or address — the address is
//!   encrypted in the browser to the shipping carrier's key.
//! - The seller is paid only after the carrier confirms delivery and the
//!   buyer's inspection window passes (or the buyer releases early).
//! - If the seller doesn't ship in time, anyone can trigger a full refund.
//! - Every outcome updates the seller's on-chain record, so reputation comes
//!   from real, completed orders and can't be faked or deleted.
//!
//! Each function below is a thin wrapper; the logic (with comments) lives in
//! `instructions/`.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("9TBWXeFennM42nASPhYY78vbNGiMQK252csS9TdgKxdD");

#[program]
pub mod ghost_checkout {
    use super::*;

    // ---- Admin ----

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        carrier: Pubkey,
        carrier_encryption_key: [u8; 32],
        ship_window_secs: i64,
        inspection_window_secs: i64,
    ) -> Result<()> {
        instructions::config::handle_initialize_config(
            ctx,
            carrier,
            carrier_encryption_key,
            ship_window_secs,
            inspection_window_secs,
        )
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_admin: Pubkey,
        carrier: Pubkey,
        carrier_encryption_key: [u8; 32],
        ship_window_secs: i64,
        inspection_window_secs: i64,
    ) -> Result<()> {
        instructions::config::handle_update_config(
            ctx,
            new_admin,
            carrier,
            carrier_encryption_key,
            ship_window_secs,
            inspection_window_secs,
        )
    }

    // ---- Sellers ----

    pub fn register_seller(ctx: Context<RegisterSeller>, name: String) -> Result<()> {
        instructions::seller::handle_register_seller(ctx, name)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        title: String,
        image_url: String,
        price: u64,
    ) -> Result<()> {
        instructions::seller::handle_create_listing(ctx, title, image_url, price)
    }

    pub fn set_listing_active(ctx: Context<SetListingActive>, active: bool) -> Result<()> {
        instructions::seller::handle_set_listing_active(ctx, active)
    }

    // ---- Orders ----

    pub fn place_order(
        ctx: Context<PlaceOrder>,
        nonce: u64,
        encrypted_address: Vec<u8>,
    ) -> Result<()> {
        instructions::order::handle_place_order(ctx, nonce, encrypted_address)
    }

    pub fn mark_shipped(ctx: Context<MarkShipped>, tracking_hash: [u8; 32]) -> Result<()> {
        instructions::order::handle_mark_shipped(ctx, tracking_hash)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::order::handle_cancel_order(ctx)
    }

    pub fn refund_unshipped(ctx: Context<RefundUnshipped>) -> Result<()> {
        instructions::order::handle_refund_unshipped(ctx)
    }

    // ---- Delivery & disputes ----

    pub fn confirm_delivery(ctx: Context<ConfirmDelivery>) -> Result<()> {
        instructions::delivery::handle_confirm_delivery(ctx)
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        instructions::delivery::handle_release_payment(ctx)
    }

    pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
        instructions::delivery::handle_open_dispute(ctx)
    }

    pub fn resolve_dispute(ctx: Context<ResolveDispute>, refund_buyer: bool) -> Result<()> {
        instructions::delivery::handle_resolve_dispute(ctx, refund_buyer)
    }
}
