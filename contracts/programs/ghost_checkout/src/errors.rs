//! Custom error codes. The frontend shows `msg` to the user, so keep it human.

use anchor_lang::prelude::*;

#[error_code]
pub enum GhostError {
    #[msg("Seller name must be 1-32 characters")]
    InvalidSellerName,
    #[msg("Title must be 1-64 characters")]
    InvalidTitle,
    #[msg("Image URL is too long (max 200 characters)")]
    ImageUrlTooLong,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Encrypted address is missing or too long")]
    InvalidEncryptedAddress,
    #[msg("Time windows must be greater than zero")]
    InvalidWindow,
    #[msg("This listing is not for sale right now")]
    ListingInactive,
    #[msg("The order is not in the right state for this action")]
    InvalidOrderStatus,
    #[msg("The shipping deadline has already passed")]
    ShipDeadlinePassed,
    #[msg("The seller still has time to ship this order")]
    ShipDeadlineNotReached,
    #[msg("The inspection window has closed")]
    InspectionWindowClosed,
    #[msg("The inspection window is still open; only the buyer can release early")]
    InspectionWindowOpen,
    #[msg("You are not allowed to perform this action")]
    Unauthorized,
    #[msg("Sellers can't buy their own listings")]
    SelfPurchase,
    #[msg("Arithmetic overflow")]
    Overflow,
}
