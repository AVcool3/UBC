//! Seller profiles and product listings.

use anchor_lang::prelude::*;

use crate::errors::GhostError;
use crate::events::{ListingCreated, ListingStatusChanged, SellerRegistered};
use crate::state::*;

// ----------------------------------------------------------------------------
// register_seller — create the profile that holds a seller's track record.
// ----------------------------------------------------------------------------
#[derive(Accounts)]
pub struct RegisterSeller<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Seller::INIT_SPACE,
        seeds = [SELLER_SEED, authority.key().as_ref()],
        bump
    )]
    pub seller: Account<'info, Seller>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_seller(ctx: Context<RegisterSeller>, name: String) -> Result<()> {
    let trimmed = name.trim();
    require!(
        !trimmed.is_empty() && trimmed.len() <= MAX_SELLER_NAME_LEN,
        GhostError::InvalidSellerName
    );

    let seller = &mut ctx.accounts.seller;
    seller.authority = ctx.accounts.authority.key();
    seller.name = trimmed.to_string();
    seller.listing_count = 0;
    seller.completed_orders = 0;
    seller.refunded_unshipped = 0;
    seller.cancelled_orders = 0;
    seller.disputes_lost = 0;
    seller.disputes_won = 0;
    seller.total_volume = 0;
    seller.joined_at = Clock::get()?.unix_timestamp;
    seller.bump = ctx.bumps.seller;

    emit!(SellerRegistered {
        seller: seller.key(),
        authority: seller.authority,
        name: seller.name.clone(),
    });
    Ok(())
}

// ----------------------------------------------------------------------------
// create_listing — put a product up for sale.
// ----------------------------------------------------------------------------
#[derive(Accounts)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SELLER_SEED, authority.key().as_ref()],
        bump = seller.bump,
        has_one = authority @ GhostError::Unauthorized
    )]
    pub seller: Account<'info, Seller>,

    // The listing address uses the seller's current listing_count as an index,
    // so listings are numbered 0, 1, 2… per seller.
    #[account(
        init,
        payer = authority,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, seller.key().as_ref(), &seller.listing_count.to_le_bytes()],
        bump
    )]
    pub listing: Account<'info, Listing>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_listing(
    ctx: Context<CreateListing>,
    title: String,
    image_url: String,
    price: u64,
) -> Result<()> {
    let title = title.trim().to_string();
    require!(!title.is_empty() && title.len() <= MAX_TITLE_LEN, GhostError::InvalidTitle);
    require!(image_url.len() <= MAX_IMAGE_URL_LEN, GhostError::ImageUrlTooLong);
    require!(price > 0, GhostError::InvalidPrice);

    let seller = &mut ctx.accounts.seller;
    let listing = &mut ctx.accounts.listing;

    listing.seller = seller.key();
    listing.seller_authority = seller.authority;
    listing.index = seller.listing_count;
    listing.title = title;
    listing.image_url = image_url;
    listing.price = price;
    listing.active = true;
    listing.orders_placed = 0;
    listing.created_at = Clock::get()?.unix_timestamp;
    listing.bump = ctx.bumps.listing;

    seller.listing_count = seller.listing_count.checked_add(1).ok_or(GhostError::Overflow)?;

    emit!(ListingCreated {
        listing: listing.key(),
        seller: seller.key(),
        price,
        title: listing.title.clone(),
    });
    Ok(())
}

// ----------------------------------------------------------------------------
// set_listing_active — pause or resume sales of a listing.
// ----------------------------------------------------------------------------
#[derive(Accounts)]
pub struct SetListingActive<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = listing.seller_authority == authority.key() @ GhostError::Unauthorized
    )]
    pub listing: Account<'info, Listing>,
}

pub fn handle_set_listing_active(ctx: Context<SetListingActive>, active: bool) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    listing.active = active;
    emit!(ListingStatusChanged { listing: listing.key(), active });
    Ok(())
}
