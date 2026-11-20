//! Maker side: put YES inventory into program custody and set terms.
//!
//! Once shares are in the pool vault, only this program can move them, and
//! only to (a) a buyer who pays, or (b) back to the maker if they're not
//! reserved by a hold. That is what makes a held price enforceable.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::HeldError;
use crate::events::{InventoryChanged, TermsUpdated};
use crate::state::*;

// ---------------------------------------------------------------------------
// open_pool
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct OpenPool<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = yes_mint,
        has_one = collateral_mint
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init,
        payer = maker,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED, market.key().as_ref(), maker.key().as_ref()],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    pub yes_mint: Box<Account<'info, Mint>>,
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = maker,
        associated_token::mint = yes_mint,
        associated_token::authority = pool
    )]
    pub yes_vault: Box<Account<'info, TokenAccount>>,

    /// Where buyers' payments and hold fees land. Owned by the pool PDA so the
    /// maker can't close or swap it to block exercises; they claim from it instead.
    #[account(
        init,
        payer = maker,
        associated_token::mint = collateral_mint,
        associated_token::authority = pool
    )]
    pub proceeds_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_pool(ctx: Context<OpenPool>, terms: PoolTerms) -> Result<()> {
    terms.validate()?;
    require!(ctx.accounts.market.status == MarketStatus::Open, HeldError::MarketResolved);
    let now = Clock::get()?.unix_timestamp;

    let pool = &mut ctx.accounts.pool;
    pool.market = ctx.accounts.market.key();
    pool.maker = ctx.accounts.maker.key();
    pool.yes_vault = ctx.accounts.yes_vault.key();
    pool.proceeds_vault = ctx.accounts.proceeds_vault.key();
    pool.ask = terms.ask;
    pool.hold_rate = terms.hold_rate;
    pool.max_hold_secs = terms.max_hold_secs;
    pool.available = 0;
    pool.reserved = 0;
    pool.sold_now = 0;
    pool.sold_held = 0;
    pool.holds_created = 0;
    pool.terms_seq = 1;
    pool.terms_updated_at = now;
    pool.bump = ctx.bumps.pool;

    emit_terms(pool, now);
    Ok(())
}

// ---------------------------------------------------------------------------
// set_terms: new ask / hold rate / max hold. Existing holds keep their price.
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct SetTerms<'info> {
    pub maker: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_SEED, pool.market.as_ref(), maker.key().as_ref()],
        bump = pool.bump,
        has_one = maker
    )]
    pub pool: Box<Account<'info, Pool>>,
}

pub fn handle_set_terms(ctx: Context<SetTerms>, terms: PoolTerms) -> Result<()> {
    terms.validate()?;
    let now = Clock::get()?.unix_timestamp;
    let pool = &mut ctx.accounts.pool;
    pool.ask = terms.ask;
    pool.hold_rate = terms.hold_rate;
    pool.max_hold_secs = terms.max_hold_secs;
    pool.terms_seq = pool.terms_seq.checked_add(1).ok_or(HeldError::Overflow)?;
    pool.terms_updated_at = now;
    emit_terms(pool, now);
    Ok(())
}

fn emit_terms(pool: &Account<Pool>, now: i64) {
    emit!(TermsUpdated {
        schema_version: EVENT_SCHEMA_VERSION,
        pool: pool.key(),
        maker: pool.maker,
        terms_seq: pool.terms_seq,
        ask: pool.ask,
        hold_rate: pool.hold_rate,
        max_hold_secs: pool.max_hold_secs,
        updated_at: now,
    });
}

// ---------------------------------------------------------------------------
// deposit / withdraw inventory
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct MoveInventory<'info> {
    pub maker: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.market.as_ref(), maker.key().as_ref()],
        bump = pool.bump,
        has_one = maker,
        has_one = yes_vault
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(constraint = yes_mint.key() == yes_vault.mint @ HeldError::WrongTokenAccount)]
    pub yes_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub yes_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = yes_mint, token::authority = maker)]
    pub maker_yes: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_deposit(ctx: Context<MoveInventory>, shares: u64) -> Result<()> {
    require!(shares > 0, HeldError::InvalidQuantity);
    // Effects
    let pool = &mut ctx.accounts.pool;
    pool.available = pool.available.checked_add(shares).ok_or(HeldError::Overflow)?;
    // Interaction
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.maker_yes.to_account_info(),
                mint: ctx.accounts.yes_mint.to_account_info(),
                to: ctx.accounts.yes_vault.to_account_info(),
                authority: ctx.accounts.maker.to_account_info(),
            },
        ),
        shares,
        0,
    )?;
    emit!(InventoryChanged {
        schema_version: EVENT_SCHEMA_VERSION,
        pool: pool.key(),
        delta: i64::try_from(shares).map_err(|_| HeldError::Overflow)?,
        available: pool.available,
        reserved: pool.reserved,
    });
    Ok(())
}

pub fn handle_withdraw(ctx: Context<MoveInventory>, shares: u64) -> Result<()> {
    require!(shares > 0, HeldError::InvalidQuantity);
    // Checks: reserved shares belong to active holds and can never be withdrawn.
    require!(shares <= ctx.accounts.pool.available, HeldError::WithdrawExceedsAvailable);
    // Effects
    let pool = &mut ctx.accounts.pool;
    pool.available -= shares;
    // Interaction (pool PDA signs)
    let seeds: &[&[u8]] = &[POOL_SEED, pool.market.as_ref(), pool.maker.as_ref(), &[pool.bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.yes_vault.to_account_info(),
                mint: ctx.accounts.yes_mint.to_account_info(),
                to: ctx.accounts.maker_yes.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[seeds],
        ),
        shares,
        0,
    )?;
    emit!(InventoryChanged {
        schema_version: EVENT_SCHEMA_VERSION,
        pool: pool.key(),
        delta: -i64::try_from(shares).map_err(|_| HeldError::Overflow)?,
        available: pool.available,
        reserved: pool.reserved,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// claim_proceeds: maker moves earned collateral (payments + fees) out
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct ClaimProceeds<'info> {
    pub maker: Signer<'info>,

    #[account(
        seeds = [POOL_SEED, pool.market.as_ref(), maker.key().as_ref()],
        bump = pool.bump,
        has_one = maker,
        has_one = proceeds_vault
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(constraint = collateral_mint.key() == proceeds_vault.mint @ HeldError::WrongTokenAccount)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub proceeds_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = collateral_mint, token::authority = maker)]
    pub maker_collateral: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_proceeds(ctx: Context<ClaimProceeds>, amount: u64) -> Result<()> {
    require!(amount > 0, HeldError::InvalidQuantity);
    // Everything in the proceeds vault is already the maker's (no buyer funds wait here),
    // so the only check is the balance, which the token program enforces.
    let pool = &ctx.accounts.pool;
    let seeds: &[&[u8]] = &[POOL_SEED, pool.market.as_ref(), pool.maker.as_ref(), &[pool.bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.proceeds_vault.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.maker_collateral.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.collateral_mint.decimals,
    )
}
