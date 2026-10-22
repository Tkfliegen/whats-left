import type { Evidence } from "@/types/evidence";

// Display reported values only; do not infer a currency or calculate outcomes.
export function evidenceAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 }).format(amount);
  return `${currency ?? ""}${currency && /^[A-Za-z]{3}$/.test(currency) ? " " : ""}${number}`;
}

export function evidenceSummary(evidence: Evidence): string {
  return `Revenue ${evidenceAmount(evidence.revenue.total, evidence.currency)} · Operating Costs ${evidenceAmount(evidence.costs.total, evidence.currency)}`;
}
