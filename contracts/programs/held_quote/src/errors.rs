//! Every rule the program enforces has its own error, so the UI can explain
//! exactly what happened ("the price moved above your max", "hold expired", …).

use anchor_lang::prelude::*;

#[error_code]
pub enum HeldError {
    #[msg("Price must be between $0.01 and $0.99, in whole cents")]
    InvalidPrice,
    #[msg("Quantity must be at least 1 share")]
    InvalidQuantity,
    #[msg("Hold length must be between 1 second and the pool's maximum")]
    InvalidHoldLength,
    #[msg("The price is now above your maximum")]
    PriceAboveLimit,
    #[msg("The hold fee is now above your maximum")]
    FeeAboveLimit,
    #[msg("Not enough shares available")]
    InsufficientInventory,
    #[msg("This hold has expired")]
    HoldExpired,
    #[msg("This hold hasn't expired yet")]
    HoldNotExpired,
    #[msg("This hold was already exercised or released")]
    HoldNotActive,
    #[msg("Trading is closed for this market")]
    MarketClosed,
    #[msg("The hold would outlast the market's trading window")]
    HoldPastClose,
    #[msg("This market is already resolved")]
    MarketResolved,
    #[msg("This market isn't resolved yet")]
    MarketNotResolved,
    #[msg("Outcome must be 1 (YES) or 2 (NO)")]
    InvalidOutcome,
    #[msg("Makers can't buy from their own pool")]
    SelfTrade,
    #[msg("Can't withdraw shares that are reserved by holds")]
    WithdrawExceedsAvailable,
    #[msg("Close time must be in the future")]
    CloseTimeInPast,
    #[msg("Text is too long")]
    TextTooLong,
    #[msg("Token account doesn't match this market or pool")]
    WrongTokenAccount,
    #[msg("Arithmetic overflow")]
    Overflow,
}
