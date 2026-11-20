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
          fontWeight={800}
          textColor={urgent ? "var(--color-warn)" : "var(--color-ink)"}
          intro={false}
        />
        <span className="text-sm text-muted">s left</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg" aria-hidden>
        <div
          className={`h-full rounded-full ${urgent ? "bg-warn" : "bg-accent-strong"} motion-safe:transition-[width] motion-safe:duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
