"use client";
/**
 * Hold countdown: rolling seconds (React Bits Counter) plus a progress bar.
 *
 * Accessibility: the Counter renders the plain number for screen readers and
 * honours prefers-reduced-motion (digits jump instead of rolling). We don't
 * announce every second; the parent announces state changes ("held", "expired").
 * The time is the CHAIN's clock estimate — the program, not this widget,
 * decides expiry.
 */
import Counter from "./reactbits/Counter";

export function HoldCountdown({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const pct = total > 0 ? Math.min(100, (s / total) * 100) : 0;
  const urgent = s <= 10;
  return (
    <div>
      <div className="flex items-baseline gap-1" aria-label={`${s} seconds left on your hold`}>
        {/* minDigits=2 keeps the digit count stable (no slots appearing/disappearing),
            fade=0 clips neighbouring digits, and no motion blur keeps it crisp. */}
        <Counter
          value={s}
          minDigits={2}
          fade={0}
          motionBlur={false}
          duration={0.45}
          fontSize={44}
          fontWeight={600}
          textColor={urgent ? "var(--color-accent-strong)" : "var(--color-forest)"}
          intro={false}
        />
        <span className="font-serif text-sm italic text-muted">seconds left</span>
      </div>
      {/* Progress bar: forest while there is time, terracotta for the last 10 seconds. */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-forest/15" aria-hidden>
        <div
          className={`h-full rounded-full ${urgent ? "bg-accent" : "bg-forest"} motion-safe:transition-[width] motion-safe:duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
