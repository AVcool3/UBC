//! Delivery, payment release and disputes.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::GhostError;
use crate::events::{DisputeOpened, DisputeResolved, OrderDelivered, OrderRefunded, PaymentReleased};
use crate::instructions::escrow::pay_out_and_close_vault;
use crate::state::*;

pub const REFUND_REASON_DISPUTE_LOST: u8 = 2;

// ============================================================================
// confirm_delivery — only the carrier key can say "this parcel arrived".
// That means a seller can't fake sales: each completed order needs a real
// parcel scanned by the carrier. This starts the buyer's inspection window.
// ============================================================================
#[derive(Accounts)]
pub struct ConfirmDelivery<'info> {
    pub carrier: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = carrier @ GhostError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub order: Account<'info, Order>,
}

pub fn handle_confirm_delivery(ctx: Context<ConfirmDelivery>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order;
    require!(order.status == OrderStatus::Shipped, GhostError::InvalidOrderStatus);

    let release_after = now
        .checked_add(ctx.accounts.config.inspection_window_secs)
        .ok_or(GhostError::Overflow)?;
    order.status = OrderStatus::Delivered;
    order.delivered_at = now;
    order.release_after = release_after;

    emit!(OrderDelivered {
        order: order.key(),
        carrier: ctx.accounts.carrier.key(),
        release_after,
    });
    Ok(())
}

// ============================================================================
// release_payment — pay the seller.
//   * The buyer can release any time after delivery ("looks great!").
//   * Anyone else can release once the inspection window has closed with no
//     dispute, so sellers never depend on the platform to get paid.
// ============================================================================
#[derive(Accounts)]
pub struct ReleasePayment<'info> {
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

    #[account(mut, has_one = buyer, has_one = seller_authority)]
    pub order: Account<'info, Order>,

    /// Gets the vault's rent back (they paid it).
    #[account(mut)]
    pub buyer: SystemAccount<'info>,

    pub seller_authority: SystemAccount<'info>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = seller_authority
    )]
    pub seller_token: Account<'info, TokenAccount>,

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

pub fn handle_release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let caller = ctx.accounts.caller.key();
    let amount;
    {
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Delivered, GhostError::InvalidOrderStatus);
        if caller != order.buyer {
            require!(now >= order.release_after, GhostError::InspectionWindowOpen);
        }
        order.status = OrderStatus::Completed;
        amount = order.amount;

        let seller = &mut ctx.accounts.seller;
        seller.completed_orders = seller.completed_orders.checked_add(1).ok_or(GhostError::Overflow)?;
        seller.total_volume = seller.total_volume.checked_add(amount).ok_or(GhostError::Overflow)?;
    }

    pay_out_and_close_vault(
        &ctx.accounts.order,
        &ctx.accounts.vault,
        &ctx.accounts.seller_token,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.usdc_mint,
        &ctx.accounts.token_program,
    )?;

    emit!(PaymentReleased {
        order: ctx.accounts.order.key(),
        seller: ctx.accounts.order.seller_authority,
        amount,
        released_by: caller,
    });
    Ok(())
}

// ============================================================================
// open_dispute — buyer says "this is fake / broken / not what was shown".
// Freezes the money until the arbiter decides.
// ============================================================================
#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub buyer: Signer<'info>,

    #[account(mut, has_one = buyer @ GhostError::Unauthorized)]
    pub order: Account<'info, Order>,
}

pub fn handle_open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order;
    require!(order.status == OrderStatus::Delivered, GhostError::InvalidOrderStatus);
    require!(now < order.release_after, GhostError::InspectionWindowClosed);

    order.status = OrderStatus::Disputed;

    emit!(DisputeOpened { order: order.key(), buyer: order.buyer });
    Ok(())
}

// ============================================================================
// resolve_dispute — the arbiter (config.admin) decides. The outcome is
// written permanently to the seller's record either way.
// ============================================================================
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ GhostError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SELLER_SEED, order.seller_authority.as_ref()],
        bump = seller.bump
    )]
    pub seller: Account<'info, Seller>,

    #[account(mut, has_one = buyer, has_one = seller_authority)]
    pub order: Account<'info, Order>,

    #[account(mut)]
    pub buyer: SystemAccount<'info>,

    pub seller_authority: SystemAccount<'info>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer
    )]
    pub buyer_token: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = seller_authority
    )]
    pub seller_token: Account<'info, TokenAccount>,

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

pub fn handle_resolve_dispute(ctx: Context<ResolveDispute>, refund_buyer: bool) -> Result<()> {
    let amount;
    {
        let order = &mut ctx.accounts.order;
        require!(order.status == OrderStatus::Disputed, GhostError::InvalidOrderStatus);
        amount = order.amount;

        let seller = &mut ctx.accounts.seller;
        if refund_buyer {
            order.status = OrderStatus::Refunded;
            seller.disputes_lost = seller.disputes_lost.checked_add(1).ok_or(GhostError::Overflow)?;
        } else {
            order.status = OrderStatus::Completed;
            seller.disputes_won = seller.disputes_won.checked_add(1).ok_or(GhostError::Overflow)?;
            seller.completed_orders =
                seller.completed_orders.checked_add(1).ok_or(GhostError::Overflow)?;
            seller.total_volume = seller.total_volume.checked_add(amount).ok_or(GhostError::Overflow)?;
        }
    }

    // Pick who gets the money, then pay out.
    let destination = if refund_buyer {
        &ctx.accounts.buyer_token
    } else {
        &ctx.accounts.seller_token
    };
    pay_out_and_close_vault(
        &ctx.accounts.order,
        &ctx.accounts.vault,
        destination,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.usdc_mint,
        &ctx.accounts.token_program,
    )?;

    if refund_buyer {
        emit!(OrderRefunded {
            order: ctx.accounts.order.key(),
            buyer: ctx.accounts.order.buyer,
            amount,
            reason: REFUND_REASON_DISPUTE_LOST,
        });
    } else {
        emit!(PaymentReleased {
            order: ctx.accounts.order.key(),
            seller: ctx.accounts.order.seller_authority,
            amount,
            released_by: ctx.accounts.admin.key(),
        });
    }
    emit!(DisputeResolved { order: ctx.accounts.order.key(), refunded_buyer: refund_buyer });
    Ok(())
}
