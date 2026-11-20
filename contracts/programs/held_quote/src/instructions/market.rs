//! Binary markets with fully collateralized outcome shares.
//!
//! `split` turns $1 of collateral into 1 YES + 1 NO, so every share in
//! circulation is backed by collateral sitting in the market's vault. After the
//! admin resolves the market, each winning share redeems for $1. On devnet the
//! collateral is test USDC and resolution is a test admin: these are test
//! instruments, but the accounting is real.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, TransferChecked};

use crate::errors::HeldError;
use crate::events::{MarketCreated, MarketResolved, Redeemed, SetsSplit};
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateMarketParams {
    pub id: u64,
    pub question: String,
    pub resolution_source: String,
    pub reference: String,
    pub close_time: i64,
}

// ---------------------------------------------------------------------------
// create_market
// ---------------------------------------------------------------------------
#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, &params.id.to_le_bytes()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = admin,
        seeds = [YES_SEED, market.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = market
    )]
    pub yes_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = admin,
        seeds = [NO_SEED, market.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = market
    )]
    pub no_mint: Box<Account<'info, Mint>>,

    /// Collateral backing every outstanding set.
    #[account(
        init,
        payer = admin,
        associated_token::mint = collateral_mint,
        associated_token::authority = market
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    require!(params.question.len() <= MAX_QUESTION_LEN, HeldError::TextTooLong);
    require!(params.resolution_source.len() <= MAX_SOURCE_LEN, HeldError::TextTooLong);
    require!(params.reference.len() <= MAX_REFERENCE_LEN, HeldError::TextTooLong);
    let now = Clock::get()?.unix_timestamp;
    require!(params.close_time > now, HeldError::CloseTimeInPast);

    let market = &mut ctx.accounts.market;
    market.id = params.id;
    market.admin = ctx.accounts.admin.key();
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.yes_mint = ctx.accounts.yes_mint.key();
    market.no_mint = ctx.accounts.no_mint.key();
    market.vault = ctx.accounts.vault.key();
    market.question = params.question;
    market.resolution_source = params.resolution_source;
    market.reference = params.reference;
    market.close_time = params.close_time;
    market.status = MarketStatus::Open;
    market.outcome = 0;
    market.sets_outstanding = 0;
    market.bump = ctx.bumps.market;

    emit!(MarketCreated {
        schema_version: EVENT_SCHEMA_VERSION,
        market: market.key(),
        id: market.id,
        admin: market.admin,
        collateral_mint: market.collateral_mint,
        yes_mint: market.yes_mint,
        no_mint: market.no_mint,
        close_time: market.close_time,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// split: $1 collateral → 1 YES + 1 NO
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct Split<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = collateral_mint,
        has_one = yes_mint,
        has_one = no_mint,
        has_one = vault
    )]
    pub market: Box<Account<'info, Market>>,

    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub yes_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub no_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = collateral_mint, token::authority = owner)]
    pub owner_collateral: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = yes_mint,
        associated_token::authority = owner
    )]
    pub owner_yes: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = no_mint,
        associated_token::authority = owner
    )]
    pub owner_no: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_split(ctx: Context<Split>, sets: u64) -> Result<()> {
    // Checks
    require!(sets > 0, HeldError::InvalidQuantity);
    require!(ctx.accounts.market.status == MarketStatus::Open, HeldError::MarketResolved);
    let collateral_in = sets.checked_mul(SHARE_UNIT).ok_or(HeldError::Overflow)?;

    // Effects
    let market = &mut ctx.accounts.market;
    market.sets_outstanding = market.sets_outstanding.checked_add(sets).ok_or(HeldError::Overflow)?;

    // Interactions: collateral in, then mint both sides.
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.owner_collateral.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        collateral_in,
        ctx.accounts.collateral_mint.decimals,
    )?;

    let id_bytes = market.id.to_le_bytes();
    let seeds: &[&[u8]] = &[MARKET_SEED, &id_bytes, &[market.bump]];
    let signer = &[seeds];
    for (mint, to) in [
        (&ctx.accounts.yes_mint, &ctx.accounts.owner_yes),
        (&ctx.accounts.no_mint, &ctx.accounts.owner_no),
    ] {
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer,
            ),
            sets,
        )?;
    }

    emit!(SetsSplit {
        schema_version: EVENT_SCHEMA_VERSION,
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        sets,
        collateral_in,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// resolve (admin)
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct Resolve<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = admin
    )]
    pub market: Box<Account<'info, Market>>,
}

pub fn handle_resolve(ctx: Context<Resolve>, outcome: u8) -> Result<()> {
    require!(outcome == 1 || outcome == 2, HeldError::InvalidOutcome);
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, HeldError::MarketResolved);
    // Only after trading closes: resolving early would void live holds (their
    // exercise needs an unresolved market) while the maker keeps the fees.
    // Holds can't outlast close_time, so after close no hold is still exercisable.
    require!(Clock::get()?.unix_timestamp >= market.close_time, HeldError::ResolveBeforeClose);
    market.status = MarketStatus::Resolved;
    market.outcome = outcome;
    emit!(MarketResolved {
        schema_version: EVENT_SCHEMA_VERSION,
        market: market.key(),
        outcome,
        resolved_at: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// redeem: burn winning shares → $1 each
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        has_one = collateral_mint,
        has_one = vault
    )]
    pub market: Box<Account<'info, Market>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Must be the winning side's mint.
    #[account(
        mut,
        constraint = (market.outcome == 1 && winning_mint.key() == market.yes_mint)
            || (market.outcome == 2 && winning_mint.key() == market.no_mint)
            @ HeldError::MarketNotResolved
    )]
    pub winning_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = winning_mint, token::authority = owner)]
    pub owner_winning: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = collateral_mint, token::authority = owner)]
    pub owner_collateral: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_redeem(ctx: Context<Redeem>, shares: u64) -> Result<()> {
    // Checks
    require!(shares > 0, HeldError::InvalidQuantity);
    require!(ctx.accounts.market.status == MarketStatus::Resolved, HeldError::MarketNotResolved);
    let collateral_out = shares.checked_mul(SHARE_UNIT).ok_or(HeldError::Overflow)?;

    // Effects
    let market = &mut ctx.accounts.market;
    market.sets_outstanding = market.sets_outstanding.checked_sub(shares).ok_or(HeldError::Overflow)?;

    // Interactions: burn the winning shares, pay $1 each from the vault.
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.winning_mint.to_account_info(),
                from: ctx.accounts.owner_winning.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        shares,
    )?;
    let id_bytes = market.id.to_le_bytes();
    let seeds: &[&[u8]] = &[MARKET_SEED, &id_bytes, &[market.bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.owner_collateral.to_account_info(),
                authority: market.to_account_info(),
            },
            &[seeds],
        ),
        collateral_out,
        ctx.accounts.collateral_mint.decimals,
    )?;

    emit!(Redeemed {
        schema_version: EVENT_SCHEMA_VERSION,
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        shares,
        collateral_out,
    });
    Ok(())
}
