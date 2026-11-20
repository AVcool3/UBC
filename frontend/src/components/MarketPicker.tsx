"use client";
/**
 * Row of market tabs, styled like a magazine's table of contents:
 *   01  ECONOMICS
 *       Will the Fed hike…
 * Each market is a separate on-chain market + maker pool, mirroring one
 * Gemini Predictions contract (display-only reference).
 * Restyle freely: it only needs `markets`, `selected` and `onSelect`.
 */
import type { MarketEntry } from "@/lib/contracts";

export function MarketPicker({ markets, selected, onSelect }: { markets: MarketEntry[]; selected: number; onSelect: (id: number) => void }) {
  return (
    <nav aria-label="Markets" className="reveal -mx-5 mb-12 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      {/* One continuous top rule; the active item gets a thicker terracotta bar over it. */}
      <div className="flex min-w-max border-t border-line sm:grid sm:min-w-0 sm:grid-cols-4">
        {markets.map((m, i) => {
          const active = m.id === selected;
          const closed = Date.parse(m.closeTime) <= Date.now();
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              aria-pressed={active}
              className={`group relative w-56 shrink-0 pr-6 pt-4 text-left transition-colors sm:w-auto ${active ? "" : "opacity-60 hover:opacity-100"}`}
            >
              {/* The bar: full width when active, grows in on hover otherwise. */}
              <span
                aria-hidden
                className={`absolute -top-px left-0 h-[3px] bg-accent transition-all duration-300 ${active ? "w-full" : "w-0 group-hover:w-1/3"}`}
              />
              <span className="kicker flex items-baseline gap-3">
                <span className="font-display text-base tracking-normal text-accent">{String(i + 1).padStart(2, "0")}</span>
                {m.category}
                {closed && " · closed"}
              </span>
              <span className="mt-1.5 line-clamp-2 font-display text-[17px] font-medium leading-snug text-ink">{m.question}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
