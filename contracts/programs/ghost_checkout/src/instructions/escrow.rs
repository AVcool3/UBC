//! Shared escrow payout helper.
//!
//! Each order's USDC lives in a token account owned by the Order PDA (the
//! "vault"). Only this program can sign for the PDA, so only the rules in this
//! program can move the money — not the seller, not the buyer, not the admin.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

use crate::state::{Order, ORDER_SEED};

/// Sends the whole vault balance to `destination`, then closes the vault and
/// returns its rent (a small SOL deposit) to the buyer who paid it.
///
/// Callers MUST update the order's status *before* calling this
/// (Checks-Effects-Interactions). Solana also blocks re-entering this program
/// through the token program, so a payout can't be triggered twice.
pub fn pay_out_and_close_vault<'info>(
    order: &Account<'info, Order>,
    vault: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    rent_receiver: &AccountInfo<'info>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    // Rebuild the Order PDA's seeds so the program can sign as the vault owner.
    let nonce_bytes = order.nonce.to_le_bytes();
    let seeds: &[&[u8]] = &[
        ORDER_SEED,
        order.listing.as_ref(),
        order.buyer.as_ref(),
        &nonce_bytes,
        &[order.bump],
    ];
    let signer = &[seeds];

    // 1) Move the escrowed USDC.
    let amount = vault.amount;
    if amount > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                TransferChecked {
                    from: vault.to_account_info(),
                    mint: mint.to_account_info(),
                    to: destination.to_account_info(),
                    authority: order.to_account_info(),
                },
                signer,
            ),
            amount,
            mint.decimals,
        )?;
    }

    // 2) Close the now-empty vault so the buyer gets its rent back.
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_receiver.clone(),
            authority: order.to_account_info(),
        },
        signer,
    ))?;

    Ok(())
}
