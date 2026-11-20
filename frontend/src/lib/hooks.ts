"use client";
/**
 * Data hooks. Everything is read straight from the chain (no backend, no
 * indexer), so the page rebuilds itself correctly after a refresh.
 */
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { COLLATERAL_MINT, MAKER, MARKET } from "./contracts";
import type { HeldProgram } from "./core";
import { ata, poolPda } from "./pda";
import type { ReferenceQuote } from "./reference";
import { HOLD_BUYER_OFFSET, type HoldAccount, type MarketAccount, type PoolAccount, type WithKey } from "./types";

const POLL_MS = 5_000;

/** Window event fired after every transaction stage change, so every hook refreshes together. */
export const CHAIN_CHANGED_EVENT = "held:chain-changed";
export const announceChainChange = () => window.dispatchEvent(new Event(CHAIN_CHANGED_EVENT));

/** Generic "load now, then every N ms" hook with refresh() and error state. */
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
      // Keep showing the last good data; the UI marks it as possibly out of date.
      setError((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
    const t = setInterval(refresh, intervalMs);
    window.addEventListener(CHAIN_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener(CHAIN_CHANGED_EVENT, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh };
}

export interface VenueState {
  market: PublicKey;
  marketData: MarketAccount;
  pool: PublicKey;
  poolData: PoolAccount;
  /** YES shares actually sitting in the pool vault (should equal available + reserved). */
  vaultShares: number;
  /** When we read it (local ms). */
  readAt: number;
}

/** The market + the maker's pool, read from chain. */
export function useVenue(program: HeldProgram) {
  const { connection } = useConnection();
  return usePolling<VenueState>(async () => {
    const pool = poolPda(MARKET, MAKER);
    const [marketData, poolData] = await Promise.all([program.account.market.fetch(MARKET), program.account.pool.fetch(pool)]);
    const vault = await connection.getTokenAccountBalance(poolData.yesVault, "confirmed");
    return { market: MARKET, marketData, pool, poolData, vaultShares: Number(vault.value.amount), readAt: Date.now() };
  }, [program, connection]);
}

/** The connected buyer's holds in this pool, newest first. */
export function useMyHolds(program: HeldProgram, buyer: PublicKey | null) {
  return usePolling<WithKey<HoldAccount>[]>(
    buyer
      ? async () => {
          const holds = await program.account.hold.all([{ memcmp: { offset: HOLD_BUYER_OFFSET, bytes: buyer.toBase58() } }]);
          return holds.sort((a, b) => b.account.createdAt.toNumber() - a.account.createdAt.toNumber());
        }
      : null,
    [program, buyer?.toBase58()]
  );
}

/** Test USDC and YES balances (base units / shares). 0 if the account doesn't exist yet. */
export function useBalances(owner: PublicKey | null, yesMint: PublicKey | null) {
  const { connection } = useConnection();
  return usePolling<{ usdc: number; yes: number; sol: number }>(
    owner
      ? async () => {
          const read = async (mint: PublicKey) => {
            try {
              return Number((await connection.getTokenAccountBalance(ata(mint, owner), "confirmed")).value.amount);
            } catch {
              return 0;
            }
          };
          const [usdc, yes, sol] = await Promise.all([read(COLLATERAL_MINT), yesMint ? read(yesMint) : 0, connection.getBalance(owner, "confirmed")]);
          return { usdc, yes, sol };
        }
      : null,
    [connection, owner?.toBase58(), yesMint?.toBase58()]
  );
}

/** Display-only reference quote from our server adapter. */
export function useReference() {
  return usePolling<ReferenceQuote>(async () => {
    const res = await fetch("/api/reference", { cache: "no-store" });
    if (!res.ok) throw new Error(`Reference unavailable (${res.status})`);
    return (await res.json()) as ReferenceQuote;
  }, [], 10_000);
}

/**
 * Seconds since epoch on the CHAIN's clock (estimated). Expiry is decided by the
 * chain's Clock, not this browser's, so countdowns use this offset-corrected time.
 */
export function useChainNow(): number {
  const { connection } = useConnection();
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const slot = await connection.getSlot("confirmed");
        const t = await connection.getBlockTime(slot);
        if (alive && t) setOffset(t - Date.now() / 1000);
      } catch {
        /* keep the previous offset */
      }
    };
    sync();
    const s = setInterval(sync, 30_000);
    const t = setInterval(() => setNow(Date.now() / 1000), 250);
    return () => {
      alive = false;
      clearInterval(s);
      clearInterval(t);
    };
  }, [connection]);
  return now + offset;
}
