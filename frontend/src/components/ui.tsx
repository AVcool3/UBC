"use client";
/**
 * Small shared UI pieces (buttons, cards, inputs…). Styling lives here so
 * pages stay readable — tweak a look once and it changes everywhere.
 * Colours come from the tokens in app/globals.css.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-label="Loading"
    />
  );
}

/*
 * Button looks:
 *  primary   — solid ink that warms to terracotta on hover (the one main action)
 *  secondary — paper with a hairline border
 *  danger    — red outline
 *  ghost     — text only
 */
type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-accent-strong shadow-[0_8px_20px_-10px_rgb(29_26_22/0.6)]",
  secondary: "bg-surface text-ink border border-line hover:border-ink/40",
  danger: "bg-bad/10 text-bad border border-bad/40 hover:bg-bad/15",
  ghost: "text-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium tracking-wide transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** A sheet of slightly lighter paper with a hairline edge. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-6 ${className}`}>{children}</div>;
}

export function Input({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="kicker mb-1.5 block">{label}</span>
      <input
        {...rest}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none placeholder:text-muted/60 focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-10 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

/**
 * Editorial page header:
 *   KICKER —— KICKER
 *   Big serif title
 *   Serif standfirst (subtitle)
 */
export function PageTitle({ title, subtitle, right, kicker }: { title: string; subtitle?: ReactNode; right?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="reveal mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {kicker && <p className="kicker mb-4 flex items-center gap-4">{kicker}</p>}
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 font-serif text-lg leading-relaxed text-muted sm:text-xl">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** "LEFT —— RIGHT" kicker pair with the terracotta dash between them. */
export function KickerPair({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <>
      <span>{left}</span>
      {/* Hidden on phones, where the pair wraps onto two lines. */}
      <span aria-hidden className="kicker-rule hidden sm:inline-block" />
      <span>{right}</span>
    </>
  );
}

export function LoadingBlock({ label = "Reading from Solana…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-bad/40 bg-bad/5 p-4 text-sm text-bad">
      Couldn&apos;t load data: {error}
      {onRetry && (
        <button onClick={onRetry} className="ml-2 underline">
          Retry
        </button>
      )}
    </div>
  );
}
