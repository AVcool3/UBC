"use client";
/** Order status pill + a step-by-step progress line. */
import type { OrderStatusName } from "@/lib/types";

const STYLES: Record<OrderStatusName, { label: string; cls: string }> = {
  paid: { label: "Paid · in escrow", cls: "bg-warn/15 text-warn" },
  shipped: { label: "Shipped", cls: "bg-accent/15 text-accent" },
  delivered: { label: "Delivered · inspecting", cls: "bg-accent/15 text-accent" },
  disputed: { label: "Disputed", cls: "bg-bad/15 text-bad" },
  completed: { label: "Completed · seller paid", cls: "bg-good/15 text-good" },
  refunded: { label: "Refunded", cls: "bg-good/15 text-good" },
  cancelled: { label: "Cancelled · refunded", cls: "bg-surface-2 text-muted" },
};

export function StatusBadge({ status }: { status: OrderStatusName }) {
  const s = STYLES[status];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

const STEPS: { key: OrderStatusName; label: string }[] = [
  { key: "paid", label: "Paid" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Seller paid" },
];

/** Horizontal progress for the normal path; refunds/disputes show their own end state. */
export function StatusSteps({ status }: { status: OrderStatusName }) {
  const order: OrderStatusName[] = ["paid", "shipped", "delivered", "completed"];
  const reached = status === "disputed" ? 2 : order.indexOf(status);
  if (status === "refunded" || status === "cancelled") {
    return <p className="text-xs text-muted">Money returned to the buyer from escrow.</p>;
  }
  return (
    <ol className="flex items-center gap-1 text-[11px] text-muted">
      {STEPS.map((step, i) => (
        <li key={step.key} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${i <= reached ? "bg-accent" : "bg-line"}`} />
          <span className={i <= reached ? "text-ink" : ""}>{step.label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-line" />}
        </li>
      ))}
    </ol>
  );
}
