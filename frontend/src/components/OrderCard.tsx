"use client";
/** One order row, shared by the buyer, seller, carrier and arbiter pages. Pass role-specific buttons as `actions`. */
import type { ReactNode } from "react";
import { explorerAddress } from "@/lib/contracts";
import { orderCode, usd } from "@/lib/format";
import { statusOf, type ListingAccount, type OrderAccount, type WithKey } from "@/lib/types";
import { ProductArt } from "./ProductArt";
import { StatusBadge, StatusSteps } from "./StatusBadge";

type Props = {
  order: WithKey<OrderAccount>;
  listing?: ListingAccount;
  highlight?: boolean;
  /** Extra info line(s), e.g. a countdown. */
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function OrderCard({ order, listing, highlight, info, actions, children }: Props) {
  const status = statusOf(order.account);
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${highlight ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-start gap-4">
        <ProductArt
          title={listing?.title ?? "Item"}
          imageUrl={listing?.imageUrl ?? ""}
          className="h-16 w-16 shrink-0 rounded-xl text-sm [&_span]:text-3xl"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{listing?.title ?? "Listing"}</span>
            <StatusBadge status={status} />
          </div>
          <div className="text-sm text-muted">
            Order <span className="font-mono text-ink">{orderCode(order.publicKey)}</span> · {usd(order.account.amount)} ·{" "}
            <a className="underline" href={explorerAddress(order.publicKey.toBase58())} target="_blank" rel="noreferrer">
              on-chain ↗
            </a>
          </div>
          <StatusSteps status={status} />
          {info && <div className="pt-1 text-sm">{info}</div>}
        </div>
        {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-col">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
