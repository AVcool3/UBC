"use client";
/**
 * Row of market tabs. Each market is a separate on-chain market + maker pool,
 * mirroring one Gemini Predictions contract (display-only reference).
 * Restyle freely: it only needs `markets`, `selected` and `onSelect`.
 */
import type { MarketEntry } from "@/lib/contracts";

export function MarketPicker({ markets, selected, onSelect }: { markets: MarketEntry[]; selected: number; onSelect: (id: number) => void }) {
  return (
    <nav aria-label="Markets" className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {markets.map((m) => {
        const active = m.id === selected;
        const closed = Date.parse(m.closeTime) <= Date.now();
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            aria-pressed={active}
            className={`min-w-[180px] shrink-0 rounded-2xl border px-3 py-2 text-left text-sm ${
              active ? "border-accent bg-accent-strong/10" : "border-line hover:border-accent/50"
            }`}
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
              {m.category}
              {closed && " · closed"}
            </span>
            <span className="line-clamp-2 font-medium">{m.question}</span>
          </button>
        );
      })}
    </nav>
  );
}
