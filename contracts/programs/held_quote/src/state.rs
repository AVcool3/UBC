//! On-chain accounts and constants.
//!
//! Units (keep these straight everywhere — UI, scripts and econ use the same):
//!   * Outcome shares are whole numbers (YES/NO mints have 0 decimals).
//!   * Collateral is a 6-decimal stablecoin (test USDC on devnet).
//!   * Prices are collateral base units PER SHARE: 600_000 = $0.60.
//!     A complete set (1 YES + 1 NO) always costs exactly SHARE_UNIT = $1.00.

use anchor_lang::prelude::*;

pub const MARKET_SEED: &[u8] = b"market";
pub const YES_SEED: &[u8] = b"yes";
pub const NO_SEED: &[u8] = b"no";
pub const POOL_SEED: &[u8] = b"pool";
pub const HOLD_SEED: &[u8] = b"hold";

/// Collateral backing one complete set (1 YES + 1 NO): $1.00.
pub const SHARE_UNIT: u64 = 1_000_000;
/// Price grid: $0.01.
pub const PRICE_TICK: u64 = 10_000;
/// Longest hold any pool may offer (10 minutes).
pub const MAX_HOLD_SECS_LIMIT: u32 = 600;

pub const MAX_QUESTION_LEN: usize = 160;
pub const MAX_SOURCE_LEN: usize = 160;
pub const MAX_REFERENCE_LEN: usize = 64;

/// Version stamped into every event so indexers can evolve safely.
pub const EVENT_SCHEMA_VERSION: u8 = 1;

/// A binary question with fully collateralized YES/NO share mints.
/// seeds = ["market", id_le]
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub id: u64,
    /// Creates the market and resolves it (test admin on devnet).
    pub admin: Pubkey,
    pub collateral_mint: Pubkey,
    /// PDA mints (authority = this market), 0 decimals.
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    /// Collateral backing every outstanding set (ATA owned by this market).
    pub vault: Pubkey,
    #[max_len(MAX_QUESTION_LEN)]
    pub question: String,
    /// Where the answer comes from, in words (shown to buyers).
    #[max_len(MAX_SOURCE_LEN)]
    pub resolution_source: String,
    /// Display-only reference contract this market mirrors (e.g. a Gemini symbol).
    /// Prices from it are never executable here.
    #[max_len(MAX_REFERENCE_LEN)]
    pub reference: String,
    /// Trading (buy_now / hold / exercise) stops at this unix time.
    pub close_time: i64,
    pub status: MarketStatus,
    /// 0 = unresolved, 1 = YES won, 2 = NO won.
    pub outcome: u8,
    /// Complete sets minted minus sets redeemed (each backed by SHARE_UNIT in the vault).
    pub sets_outstanding: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketStatus {
    Open,
    Resolved,
}

/// One maker's YES inventory for one market, held in program custody.
/// seeds = ["pool", market, maker]
///
/// Invariant (checked in tests): yes_vault balance == available + reserved.
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub market: Pubkey,
    pub maker: Pubkey,
    /// YES shares in custody (ATA owned by this pool PDA).
    pub yes_vault: Pubkey,
    /// Collateral account owned by this pool PDA; every payment and hold fee lands here.
    /// (Not the maker's own account: a maker could close that to make exercises fail.)
    pub proceeds_vault: Pubkey,
    /// Executable ask for immediate buys and new holds (base units per share).
    pub ask: u64,
    /// Hold fee in base units per share per minute (pro-rated per second, rounded up).
    pub hold_rate: u64,
    /// Longest hold this maker will write.
    pub max_hold_secs: u32,
    /// Shares anyone can buy or hold right now.
    pub available: u64,
    /// Shares locked by active holds (can only go to the hold's buyer, or back to `available`).
    pub reserved: u64,
    pub sold_now: u64,
    pub sold_held: u64,
    pub holds_created: u64,
    /// Bumps every time the maker changes terms; holds record the seq they were written at.
    pub terms_seq: u64,
    pub terms_updated_at: i64,
    pub bump: u8,
}

/// A held price: `qty` shares reserved for `buyer` at `price` until `expires_at`.
/// seeds = ["hold", pool, buyer, nonce_le]
///
/// Never closed: after settlement it stays on-chain as the receipt.
#[account]
#[derive(InitSpace)]
pub struct Hold {
    pub pool: Pubkey,
    pub market: Pubkey,
    pub maker: Pubkey,
    /// The only wallet that can exercise.
    pub buyer: Pubkey,
    pub nonce: u64,
    /// What changes hands on exercise.
    pub outcome_mint: Pubkey,
    pub collateral_mint: Pubkey,
    /// 0 = buy YES (the only side in this version).
    pub side: u8,
    pub qty: u64,
    /// Held price, base units per share.
    pub price: u64,
    /// Fee paid to the maker when the hold was written (non-refundable).
    pub fee_paid: u64,
    /// Pool terms_seq at the moment of the hold.
    pub terms_seq: u64,
    pub created_at: i64,
    /// Exercise allowed while now < expires_at; release allowed when now >= expires_at.
    pub expires_at: i64,
    pub status: HoldStatus,
    pub settled_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum HoldStatus {
    /// Price held, shares reserved. NOT a fill.
    Held,
    /// Buyer paid and received the shares.
    Exercised,
    /// Expired unused; shares returned to the pool's available inventory.
    Released,
}

/// Terms a maker sets on their pool.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PoolTerms {
    pub ask: u64,
    pub hold_rate: u64,
    pub max_hold_secs: u32,
}

impl PoolTerms {
    pub fn validate(&self) -> Result<()> {
        use crate::errors::HeldError;
        require!(
            self.ask > 0 && self.ask < SHARE_UNIT && self.ask % PRICE_TICK == 0,
            HeldError::InvalidPrice
        );
        require!(
            self.max_hold_secs > 0 && self.max_hold_secs <= MAX_HOLD_SECS_LIMIT,
            HeldError::InvalidHoldLength
        );
        Ok(())
    }
}

/// Hold fee = ceil(hold_rate × qty × hold_secs / 60). Rounded UP so the maker
/// is never paid less than the posted rate; u128 so it can't overflow.
pub fn hold_fee(hold_rate: u64, qty: u64, hold_secs: u32) -> Result<u64> {
    let num = (hold_rate as u128)
        .checked_mul(qty as u128)
        .and_then(|v| v.checked_mul(hold_secs as u128))
        .ok_or(crate::errors::HeldError::Overflow)?;
    let fee = num.div_ceil(60);
    u64::try_from(fee).map_err(|_| crate::errors::HeldError::Overflow.into())
}

/// price × qty with overflow check.
pub fn total_cost(price: u64, qty: u64) -> Result<u64> {
    price.checked_mul(qty).ok_or(crate::errors::HeldError::Overflow.into())
}

/// Exercise window: strictly before expiry.
pub fn can_exercise(now: i64, expires_at: i64) -> bool {
    now < expires_at
}

/// Release window: at or after expiry. Exactly one of these is true at any
/// timestamp, so there is no instant where both (or neither) can happen.
pub fn can_release(now: i64, expires_at: i64) -> bool {
    now >= expires_at
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_rounds_up_and_matches_rate() {
        // $0.01 per share-minute, 20 shares, 30 s → $0.10 exactly.
        assert_eq!(hold_fee(10_000, 20, 30).unwrap(), 100_000);
        // 1 base unit/share-min, 1 share, 1 s → 1/60 → rounds up to 1.
        assert_eq!(hold_fee(1, 1, 1).unwrap(), 1);
        // Zero rate → free hold.
        assert_eq!(hold_fee(0, 1_000, 600).unwrap(), 0);
        // Never below the exact pro-rata amount, never more than 1 unit above.
        let mut x: u64 = 0x9E37_79B9_7F4A_7C15;
        for _ in 0..10_000 {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            let rate = x % 50_000;
            let qty = (x >> 20) % 10_000 + 1;
            let secs = ((x >> 40) % 600 + 1) as u32;
            let fee = hold_fee(rate, qty, secs).unwrap() as u128;
            let exact_num = rate as u128 * qty as u128 * secs as u128;
            assert!(fee * 60 >= exact_num);
            assert!(fee * 60 < exact_num + 60);
        }
    }

    #[test]
    fn fee_overflow_is_an_error_not_a_wrap() {
        assert!(hold_fee(u64::MAX, u64::MAX, MAX_HOLD_SECS_LIMIT).is_err());
        assert!(total_cost(u64::MAX, 2).is_err());
    }

    #[test]
    fn expiry_boundary_is_non_overlapping() {
        let exp = 1_000;
        for now in (exp - 3)..=(exp + 3) {
            // Exactly one action is possible at every second.
            assert!(can_exercise(now, exp) ^ can_release(now, exp));
        }
        assert!(can_exercise(exp - 1, exp));
        assert!(!can_exercise(exp, exp));
        assert!(can_release(exp, exp));
    }

    #[test]
    fn terms_validation() {
        let ok = PoolTerms { ask: 600_000, hold_rate: 10_000, max_hold_secs: 60 };
        assert!(ok.validate().is_ok());
        for bad_ask in [0, 5_000, 605_000, SHARE_UNIT, SHARE_UNIT + PRICE_TICK] {
            assert!(PoolTerms { ask: bad_ask, ..ok }.validate().is_err());
        }
        assert!(PoolTerms { max_hold_secs: 0, ..ok }.validate().is_err());
        assert!(PoolTerms { max_hold_secs: MAX_HOLD_SECS_LIMIT + 1, ..ok }.validate().is_err());
    }
}
