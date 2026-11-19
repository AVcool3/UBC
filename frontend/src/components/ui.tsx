"use client";
/**
 * Small shared UI pieces (buttons, cards, inputs…). Styling lives here so
 * pages stay readable — tweak a look once and it changes everywhere.
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

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-strong text-white hover:brightness-110",
  secondary: "bg-surface-2 text-ink border border-line hover:border-accent/60",
  danger: "bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25",
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
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Input({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-muted">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-ink outline-none placeholder:text-muted/60 focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
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
    <div className="rounded-2xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
      Couldn&apos;t load data: {error}
      {onRetry && (
        <button onClick={onRetry} className="ml-2 underline">
          Retry
        </button>
      )}
    </div>
  );
}
