"use client";
/**
 * Data hooks. Each one reads accounts straight from the chain and re-polls
 * every few seconds, so dashboards stay live without a backend or indexer.
 */
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GhostProgram } from "./program";
import { configPda, sellerPda, usdcAta } from "./pda";
import type { ConfigAccount, ListingAccount, OrderAccount, SellerAccount, WithKey } from "./types";

const POLL_MS = 8000;

/** Generic "load now, then every N ms" hook with a manual refresh(). */
export function usePolling<T>(load: (() => Promise<T>) | null, deps: unknown[], intervalMs = POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    if (!loadRef.current) {
      setLoading(false);
      return;
    }
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh };
}

/** Marketplace settings (USDC mint, carrier keys, time windows). null = not initialized yet. */
export function useConfig(program: GhostProgram) {
  return usePolling<ConfigAccount | null>(() => program.account.config.fetchNullable(configPda()), [program], 60_000);
}

/** All listings + all seller profiles (keyed by seller wallet) for the feed. */
export function useMarket(program: GhostProgram) {
  return usePolling(async () => {
    const [listings, sellers] = await Promise.all([program.account.listing.all(), program.account.seller.all()]);
    const byAuthority = new Map<string, WithKey<SellerAccount>>();
    sellers.forEach((s) => byAuthority.set(s.account.authority.toBase58(), s));
    listings.sort((a, b) => b.account.createdAt.toNumber() - a.account.createdAt.toNumber());
    return { listings: listings as WithKey<ListingAccount>[], sellers: byAuthority };
  }, [program]);
}

// Byte offsets of fields inside an Order account (8-byte discriminator first).
// Used to ask the RPC for only the orders we care about.
const ORDER_BUYER_OFFSET = 8;
const ORDER_SELLER_OFFSET = 8 + 32;

/** Orders filtered by buyer or seller wallet, or every order ("all"), newest first. */
export function useOrders(program: GhostProgram, filter: { buyer: PublicKey } | { seller: PublicKey } | "all" | null) {
  const key = filter === null ? "none" : filter === "all" ? "all" : "buyer" in filter ? `b:${filter.buyer}` : `s:${filter.seller}`;
  return usePolling<WithKey<OrderAccount>[]>(
    filter === null
      ? null
      : async () => {
          const filters =
            filter === "all"
              ? []
              : "buyer" in filter
                ? [{ memcmp: { offset: ORDER_BUYER_OFFSET, bytes: filter.buyer.toBase58() } }]
                : [{ memcmp: { offset: ORDER_SELLER_OFFSET, bytes: filter.seller.toBase58() } }];
          const orders = await program.account.order.all(filters);
          return orders.sort((a, b) => b.account.createdAt.toNumber() - a.account.createdAt.toNumber());
        },
    [program, key]
  );
}

/** One seller's profile, or null if that wallet hasn't registered. */
export function useSellerProfile(program: GhostProgram, authority: PublicKey | null) {
  return usePolling<SellerAccount | null>(
    authority ? () => program.account.seller.fetchNullable(sellerPda(authority)) : null,
    [program, authority?.toBase58()]
  );
}

/** USDC balance (base units) of a wallet. 0 if it has no USDC account yet. */
export function useUsdcBalance(mint: PublicKey | null | undefined, owner: PublicKey | null | undefined) {
  const { connection } = useConnection();
  return usePolling<number>(
    mint && owner
      ? async () => {
          try {
            const res = await connection.getTokenAccountBalance(usdcAta(mint, owner));
            return Number(res.value.amount);
          } catch {
            return 0; // token account doesn't exist yet
          }
        }
      : null,
    [connection, mint?.toBase58(), owner?.toBase58()]
  );
}

/** Current unix time in seconds, ticking every second (for countdowns). */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
