//! Buying YES shares from a maker's pool. Payments go to the pool-owned
//! proceeds vault (the maker claims them with claim_proceeds).
//!
//!   buy_now   Atomic: pay `ask × qty`, receive `qty` shares, in one transaction.
//!             Fails (and nothing moves) if the ask is above the buyer's max.
//!   hold      Pay a disclosed fee now; the current ask is frozen for you and
//!             `qty` shares move from `available` to `reserved` (still in program
//!             custody, so the maker can't sell or withdraw them). NOT a fill.
//!   exercise  Before expiry, the hold's buyer pays `price × qty` and receives
//!             the shares atomically.
//!   release   At/after expiry, ANYONE can return an unused hold's shares to the
//!             pool. Shares only ever go back to `available` — never to the caller.
//!
//! Expiry boundary (non-overlapping): exercise needs now < expires_at,
//! release needs now >= expires_at, using the Clock sysvar's unix_timestamp.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::HeldError;
use crate::events::{Filled, HoldCreated, HoldReleased};
use crate::state::*;

const KIND_IMMEDIATE: u8 = 0;
const KIND_HELD: u8 = 1;

/// Trading is allowed only while the market is unresolved and before close.
fn require_trading(market: &Market, now: i64) -> Result<()> {
    require!(market.status == MarketStatus::Open, HeldError::MarketResolved);
    require!(now < market.close_time, HeldError::MarketClosed);
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts shared by buy_now and exercise (both deliver shares for payment)
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct BuyNow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = yes_mint,
        has_one = collateral_mint
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [POOL_SEED, market.key().as_ref(), pool.maker.as_ref()],
        bump = pool.bump,
        has_one = market,
        has_one = yes_vault,
        has_one = proceeds_vault
    )]
    pub pool: Box<Account<'info, Pool>>,

    pub yes_mint: Box<Account<'info, Mint>>,
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub yes_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub proceeds_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = collateral_mint, token::authority = buyer)]
    pub buyer_collateral: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = yes_mint,
        associated_token::authority = buyer
    )]
    pub buyer_yes: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_now(ctx: Context<BuyNow>, qty: u64, max_price: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    // ---- Checks ----
    require_trading(&ctx.accounts.market, now)?;
    require!(qty > 0, HeldError::InvalidQuantity);
    let pool = &ctx.accounts.pool;
    require!(ctx.accounts.buyer.key() != pool.maker, HeldError::SelfTrade);
    require!(pool.ask <= max_price, HeldError::PriceAboveLimit);
    require!(pool.available >= qty, HeldError::InsufficientInventory);
    let price = pool.ask;
    let total = total_cost(price, qty)?;

    // ---- Effects ----
    let pool = &mut ctx.accounts.pool;
    pool.available -= qty;
    pool.sold_now = pool.sold_now.checked_add(qty).ok_or(HeldError::Overflow)?;
    let terms_seq = pool.terms_seq;

    // ---- Interactions: payment and shares in the same transaction ----
    deliver(
        &ctx.accounts.token_program,
        &ctx.accounts.buyer,
        &ctx.accounts.pool,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.yes_mint,
        &ctx.accounts.buyer_collateral,
        &ctx.accounts.proceeds_vault,
        &ctx.accounts.yes_vault,
        &ctx.accounts.buyer_yes,
        total,
        qty,
    )?;

    emit!(Filled {
        schema_version: EVENT_SCHEMA_VERSION,
        kind: KIND_IMMEDIATE,
        market: ctx.accounts.market.key(),
        pool: ctx.accounts.pool.key(),
        hold: Pubkey::default(),
        buyer: ctx.accounts.buyer.key(),
        maker: ctx.accounts.pool.maker,
        outcome_mint: ctx.accounts.yes_mint.key(),
        collateral_mint: ctx.accounts.collateral_mint.key(),
        qty,
        price,
        total_paid: total,
        terms_seq,
        filled_at: now,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// hold
// ---------------------------------------------------------------------------
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateHold<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = collateral_mint
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [POOL_SEED, market.key().as_ref(), pool.maker.as_ref()],
        bump = pool.bump,
        has_one = market,
        has_one = proceeds_vault
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Hold::INIT_SPACE,
        seeds = [HOLD_SEED, pool.key().as_ref(), buyer.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub hold: Box<Account<'info, Hold>>,

    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub proceeds_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = buyer)]
    pub buyer_collateral: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_hold(
    ctx: Context<CreateHold>,
    nonce: u64,
    qty: u64,
    hold_secs: u32,
    max_price: u64,
    max_fee: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    // ---- Checks ----
    let market = &ctx.accounts.market;
    require_trading(market, now)?;
    require!(qty > 0, HeldError::InvalidQuantity);
    let pool = &ctx.accounts.pool;
    require!(ctx.accounts.buyer.key() != pool.maker, HeldError::SelfTrade);
    require!(hold_secs > 0 && hold_secs <= pool.max_hold_secs, HeldError::InvalidHoldLength);
    let expires_at = now.checked_add(hold_secs as i64).ok_or(HeldError::Overflow)?;
    require!(expires_at <= market.close_time, HeldError::HoldPastClose);
    require!(pool.ask <= max_price, HeldError::PriceAboveLimit);
    let fee = hold_fee(pool.hold_rate, qty, hold_secs)?;
    require!(fee <= max_fee, HeldError::FeeAboveLimit);
    require!(pool.available >= qty, HeldError::InsufficientInventory);
    // The exercise payment must be representable too.
    total_cost(pool.ask, qty)?;

    // ---- Effects ----
    let market_key = market.key();
    let pool = &mut ctx.accounts.pool;
    pool.available -= qty;
    pool.reserved = pool.reserved.checked_add(qty).ok_or(HeldError::Overflow)?;
    pool.holds_created = pool.holds_created.checked_add(1).ok_or(HeldError::Overflow)?;

    let hold = &mut ctx.accounts.hold;
    hold.pool = pool.key();
    hold.market = market_key;
    hold.maker = pool.maker;
    hold.buyer = ctx.accounts.buyer.key();
    hold.nonce = nonce;
    hold.outcome_mint = ctx.accounts.market.yes_mint;
    hold.collateral_mint = ctx.accounts.collateral_mint.key();
    hold.side = 0;
    hold.qty = qty;
    hold.price = pool.ask;
    hold.fee_paid = fee;
    hold.terms_seq = pool.terms_seq;
    hold.created_at = now;
    hold.expires_at = expires_at;
    hold.status = HoldStatus::Held;
    hold.settled_at = 0;
    hold.bump = ctx.bumps.hold;

    // ---- Interaction: the fee is the price of the commitment, paid to its writer (the maker) ----
    if fee > 0 {
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.proceeds_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            fee,
            ctx.accounts.collateral_mint.decimals,
        )?;
    }

    emit!(HoldCreated {
        schema_version: EVENT_SCHEMA_VERSION,
        market: market_key,
        pool: ctx.accounts.pool.key(),
        hold: ctx.accounts.hold.key(),
        buyer: ctx.accounts.buyer.key(),
        maker: ctx.accounts.pool.maker,
        qty,
        price: ctx.accounts.hold.price,
        fee_paid: fee,
        terms_seq: ctx.accounts.hold.terms_seq,
        created_at: now,
        expires_at,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// exercise
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct Exercise<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = yes_mint,
        has_one = collateral_mint
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [POOL_SEED, market.key().as_ref(), pool.maker.as_ref()],
        bump = pool.bump,
        has_one = market,
        has_one = yes_vault,
        has_one = proceeds_vault
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [HOLD_SEED, pool.key().as_ref(), buyer.key().as_ref(), &hold.nonce.to_le_bytes()],
        bump = hold.bump,
        has_one = pool,
        has_one = buyer
    )]
    pub hold: Box<Account<'info, Hold>>,

    pub yes_mint: Box<Account<'info, Mint>>,
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub yes_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub proceeds_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = buyer)]
    pub buyer_collateral: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = yes_mint,
        associated_token::authority = buyer
    )]
    pub buyer_yes: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_exercise(ctx: Context<Exercise>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    // ---- Checks ----
    let hold = &ctx.accounts.hold;
    require!(hold.status == HoldStatus::Held, HeldError::HoldNotActive);
    require!(can_exercise(now, hold.expires_at), HeldError::HoldExpired);
    // A resolved market would make the held price a free lottery ticket; block it.
    require!(ctx.accounts.market.status == MarketStatus::Open, HeldError::MarketResolved);
    let (qty, price) = (hold.qty, hold.price);
    let total = total_cost(price, qty)?;

    // ---- Effects ----
    let pool = &mut ctx.accounts.pool;
    pool.reserved = pool.reserved.checked_sub(qty).ok_or(HeldError::Overflow)?;
    pool.sold_held = pool.sold_held.checked_add(qty).ok_or(HeldError::Overflow)?;
    let hold = &mut ctx.accounts.hold;
    hold.status = HoldStatus::Exercised;
    hold.settled_at = now;

    // ---- Interactions ----
    deliver(
        &ctx.accounts.token_program,
        &ctx.accounts.buyer,
        &ctx.accounts.pool,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.yes_mint,
        &ctx.accounts.buyer_collateral,
        &ctx.accounts.proceeds_vault,
        &ctx.accounts.yes_vault,
        &ctx.accounts.buyer_yes,
        total,
        qty,
    )?;

    emit!(Filled {
        schema_version: EVENT_SCHEMA_VERSION,
        kind: KIND_HELD,
        market: ctx.accounts.market.key(),
        pool: ctx.accounts.pool.key(),
        hold: ctx.accounts.hold.key(),
        buyer: ctx.accounts.buyer.key(),
        maker: ctx.accounts.pool.maker,
        outcome_mint: ctx.accounts.yes_mint.key(),
        collateral_mint: ctx.accounts.collateral_mint.key(),
        qty,
        price,
        total_paid: total,
        terms_seq: ctx.accounts.hold.terms_seq,
        filled_at: now,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// release (permissionless cleanup after expiry)
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct Release<'info> {
    /// Anyone. Pays only the transaction fee; receives nothing.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.market.as_ref(), pool.maker.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [HOLD_SEED, pool.key().as_ref(), hold.buyer.as_ref(), &hold.nonce.to_le_bytes()],
        bump = hold.bump,
        has_one = pool
    )]
    pub hold: Box<Account<'info, Hold>>,
}

pub fn handle_release(ctx: Context<Release>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    // ---- Checks ----
    let hold = &ctx.accounts.hold;
    require!(hold.status == HoldStatus::Held, HeldError::HoldNotActive);
    require!(can_release(now, hold.expires_at), HeldError::HoldNotExpired);
    let qty = hold.qty;

    // ---- Effects (no token movement: the shares never left the pool vault) ----
    let pool = &mut ctx.accounts.pool;
    pool.reserved = pool.reserved.checked_sub(qty).ok_or(HeldError::Overflow)?;
    pool.available = pool.available.checked_add(qty).ok_or(HeldError::Overflow)?;
    let hold = &mut ctx.accounts.hold;
    hold.status = HoldStatus::Released;
    hold.settled_at = now;

    emit!(HoldReleased {
        schema_version: EVENT_SCHEMA_VERSION,
        pool: ctx.accounts.pool.key(),
        hold: ctx.accounts.hold.key(),
        buyer: ctx.accounts.hold.buyer,
        qty,
        caller: ctx.accounts.caller.key(),
        released_at: now,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Atomic delivery: buyer pays the maker, pool vault sends the shares.
// Both transfers are in the same instruction, so either both happen or neither.
// ---------------------------------------------------------------------------
#[allow(clippy::too_many_arguments)]
fn deliver<'info>(
    token_program: &Program<'info, Token>,
    buyer: &Signer<'info>,
    pool: &Account<'info, Pool>,
    collateral_mint: &Account<'info, Mint>,
    yes_mint: &Account<'info, Mint>,
    buyer_collateral: &Account<'info, TokenAccount>,
    proceeds_vault: &Account<'info, TokenAccount>,
    yes_vault: &Account<'info, TokenAccount>,
    buyer_yes: &Account<'info, TokenAccount>,
    total: u64,
    qty: u64,
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new(
            token_program.to_account_info(),
            TransferChecked {
                from: buyer_collateral.to_account_info(),
                mint: collateral_mint.to_account_info(),
                to: proceeds_vault.to_account_info(),
                authority: buyer.to_account_info(),
            },
        ),
        total,
        collateral_mint.decimals,
    )?;
    let seeds: &[&[u8]] = &[POOL_SEED, pool.market.as_ref(), pool.maker.as_ref(), &[pool.bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: yes_vault.to_account_info(),
                mint: yes_mint.to_account_info(),
                to: buyer_yes.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[seeds],
        ),
        qty,
        0,
    )
}
