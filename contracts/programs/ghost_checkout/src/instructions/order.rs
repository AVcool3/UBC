//! Buying, shipping, cancelling and auto-refunds.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::GhostError;
use crate::events::{OrderPlaced, OrderRefunded, OrderShipped};
use crate::instructions::escrow::pay_out_and_close_vault;
use crate::state::*;

// Reason codes used in the OrderRefunded event.
pub const REFUND_REASON_NOT_SHIPPED: u8 = 0;
pub const REFUND_REASON_SELLER_CANCELLED: u8 = 1;

// ============================================================================
// place_order — buyer pays into escrow. No name, card, or readable address is
// ever shared: the address arrives already encrypted to the carrier's key.
// ============================================================================
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Order::INIT_SPACE,
        seeds = [ORDER_SEED, listing.key().as_ref(), buyer.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    /// The buyer's USDC account that pays for the order.
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = buyer
    )]
    pub buyer_token: Account<'info, TokenAccount>,

    /// Escrow vault: a USDC account owned by the Order PDA.
    #[account(
        init,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = order
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_place_order(
    ctx: Context<PlaceOrder>,
    nonce: u64,
    encrypted_address: Vec<u8>,
) -> Result<()> {
    // ---- Checks ----
    let listing = &ctx.accounts.listing;
    require!(listing.active, GhostError::ListingInactive);
    require!(
        listing.seller_authority != ctx.accounts.buyer.key(),
        GhostError::SelfPurchase
    );
    require!(
        !encrypted_address.is_empty() && encrypted_address.len() <= MAX_ENCRYPTED_ADDRESS_LEN,
        GhostError::InvalidEncryptedAddress
    );

    let now = Clock::get()?.unix_timestamp;
    let ship_deadline = now
        .checked_add(ctx.accounts.config.ship_window_secs)
        .ok_or(GhostError::Overflow)?;
    let amount = listing.price;

    // ---- Effects ----
    let order = &mut ctx.accounts.order;
    order.buyer = ctx.accounts.buyer.key();
    order.seller_authority = listing.seller_authority;
    order.listing = listing.key();
    order.nonce = nonce;
    order.amount = amount;
    order.status = OrderStatus::Paid;
    order.created_at = now;
    order.ship_deadline = ship_deadline;
    order.shipped_at = 0;
    order.delivered_at = 0;
    order.release_after = 0;
    order.tracking_hash = [0u8; 32];
    order.encrypted_address = encrypted_address;
    order.bump = ctx.bumps.order;

    let listing = &mut ctx.accounts.listing;
    listing.orders_placed = listing.orders_placed.checked_add(1).ok_or(GhostError::Overflow)?;

    // ---- Interactions: move the buyer's USDC into escrow ----
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.buyer_token.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    emit!(OrderPlaced {
        order: ctx.accounts.order.key(),
        listing: ctx.accounts.listing.key(),
        buyer: ctx.accounts.buyer.key(),
        seller: ctx.accounts.listing.seller_authority,
        amount,
        ship_deadline,
    });
    Ok(())
}

// ============================================================================
// mark_shipped — seller hands the parcel to the carrier before the deadline.
// ============================================================================
#[derive(Accounts)]
pub struct MarkShipped<'info> {
    pub seller_authority: Signer<'info>,

    #[account(mut, has_one = seller_authority @ GhostError::Unauthorized)]
    pub order: Account<'info, Order>,
}

pub fn handle_mark_shipped(ctx: Context<MarkShipped>, tracking_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order;

    require!(order.status == OrderStatus::Paid, GhostError::InvalidOrderStatus);
    require!(now <= order.ship_deadline, GhostError::ShipDeadlinePassed);

    order.status = OrderStatus::Shipped;
    order.shipped_at = now;
    order.tracking_hash = tracking_hash;

    emit!(OrderShipped {
        order: order.key(),
        seller: order.seller_authority,
        tracking_hash,
    });
    Ok(())
}

// ============================================================================
// cancel_order — seller can't fulfil (out of stock etc.). Buyer is refunded
// in full and the cancellation is recorded on the seller's profile.
// ============================================================================
#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut)]
    pub seller_authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SELLER_SEED, seller_authority.key().as_ref()],
        bump = seller.bump
    )]
    pub seller: Account<'info, Seller>,

    #[account(mut, has_one = seller_authority @ GhostError::Unauthorized, has_one = buyer)]
    pub order: Account<'info, Order>,

    /// Receives the refund's vault rent. Must be the order's buyer.
    #[account(mut)]
    pub buyer: SystemAccount<'info>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = seller_authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer
    )]
    pub buyer_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = order
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
    // Checks + Effects
    let amount;
    {
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Paid, GhostError::InvalidOrderStatus);
        order.status = OrderStatus::Cancelled;
        amount = order.amount;

        let seller = &mut ctx.accounts.seller;
        seller.cancelled_orders = seller.cancelled_orders.checked_add(1).ok_or(GhostError::Overflow)?;
    }

    // Interactions
    pay_out_and_close_vault(
        &ctx.accounts.order,
        &ctx.accounts.vault,
        &ctx.accounts.buyer_token,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.usdc_mint,
        &ctx.accounts.token_program,
    )?;

    emit!(OrderRefunded {
        order: ctx.accounts.order.key(),
        buyer: ctx.accounts.order.buyer,
        amount,
        reason: REFUND_REASON_SELLER_CANCELLED,
    });
    Ok(())
}

// ============================================================================
// refund_unshipped — ANYONE can call this once the ship deadline has passed
// without the seller shipping. Nobody (not even the platform) can block it.
// ============================================================================
#[derive(Accounts)]
pub struct RefundUnshipped<'info> {
    /// Anyone: the buyer, a friend, or a bot. Pays for the buyer's USDC account if missing.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SELLER_SEED, order.seller_authority.as_ref()],
        bump = seller.bump
    )]
    pub seller: Account<'info, Seller>,

    #[account(mut, has_one = buyer)]
    pub order: Account<'info, Order>,

    #[account(mut)]
    pub buyer: SystemAccount<'info>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer
    )]
    pub buyer_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = order
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_refund_unshipped(ctx: Context<RefundUnshipped>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let amount;
    {
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Paid, GhostError::InvalidOrderStatus);
        require!(now > order.ship_deadline, GhostError::ShipDeadlineNotReached);
        order.status = OrderStatus::Refunded;
        amount = order.amount;

        // Permanent mark on the seller's public record.
        let seller = &mut ctx.accounts.seller;
        seller.refunded_unshipped =
            seller.refunded_unshipped.checked_add(1).ok_or(GhostError::Overflow)?;
    }

    pay_out_and_close_vault(
        &ctx.accounts.order,
        &ctx.accounts.vault,
        &ctx.accounts.buyer_token,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.usdc_mint,
        &ctx.accounts.token_program,
    )?;

    emit!(OrderRefunded {
        order: ctx.accounts.order.key(),
        buyer: ctx.accounts.order.buyer,
        amount,
        reason: REFUND_REASON_NOT_SHIPPED,
    });
    Ok(())
}
