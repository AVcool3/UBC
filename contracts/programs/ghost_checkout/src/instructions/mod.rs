//! Instruction handlers, grouped by who usually calls them.
//!
//! - config.rs   → marketplace admin (setup, carrier keys, time windows)
//! - seller.rs   → sellers (profile + listings)
//! - order.rs    → buying, shipping, cancelling, auto-refunds
//! - delivery.rs → carrier delivery, payment release, disputes
//! - escrow.rs   → shared helper that moves USDC out of an order's vault

pub mod config;
pub mod delivery;
pub mod escrow;
pub mod order;
pub mod seller;

pub use config::*;
pub use delivery::*;
pub use order::*;
pub use seller::*;
