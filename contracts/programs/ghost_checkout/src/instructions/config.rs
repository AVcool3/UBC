//! Marketplace setup. Run once after deploying (see scripts/init-config.ts).

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::errors::GhostError;
use crate::events::ConfigUpdated;
use crate::state::{Config, CONFIG_SEED};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Whoever initializes becomes admin/arbiter.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// The stablecoin all orders are priced in (USDC).
    pub usdc_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(
    ctx: Context<InitializeConfig>,
    carrier: Pubkey,
    carrier_encryption_key: [u8; 32],
    ship_window_secs: i64,
    inspection_window_secs: i64,
) -> Result<()> {
    // Checks
    require!(ship_window_secs > 0 && inspection_window_secs > 0, GhostError::InvalidWindow);

    // Effects
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.carrier = carrier;
    config.carrier_encryption_key = carrier_encryption_key;
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.ship_window_secs = ship_window_secs;
    config.inspection_window_secs = inspection_window_secs;
    config.bump = ctx.bumps.config;

    emit!(ConfigUpdated {
        admin: config.admin,
        carrier: config.carrier,
        usdc_mint: config.usdc_mint,
        ship_window_secs,
        inspection_window_secs,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ GhostError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

/// Rotate the admin/carrier keys or change the time windows.
/// The USDC mint is deliberately NOT changeable: existing vaults hold that mint.
/// New windows only apply to orders/deliveries that happen after the update.
pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    new_admin: Pubkey,
    carrier: Pubkey,
    carrier_encryption_key: [u8; 32],
    ship_window_secs: i64,
    inspection_window_secs: i64,
) -> Result<()> {
    require!(ship_window_secs > 0 && inspection_window_secs > 0, GhostError::InvalidWindow);

    let config = &mut ctx.accounts.config;
    config.admin = new_admin;
    config.carrier = carrier;
    config.carrier_encryption_key = carrier_encryption_key;
    config.ship_window_secs = ship_window_secs;
    config.inspection_window_secs = inspection_window_secs;

    emit!(ConfigUpdated {
        admin: config.admin,
        carrier: config.carrier,
        usdc_mint: config.usdc_mint,
        ship_window_secs,
        inspection_window_secs,
    });
    Ok(())
}
