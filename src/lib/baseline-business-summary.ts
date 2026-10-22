import type { Evidence } from "@/types/evidence";

// Display calculations only: accepted whole-business totals are the sole inputs.
export function baselineBusinessSummary(evidence: Evidence | null) {
  const revenue = evidence?.revenue.total ?? null;
  const operatingCosts = evidence?.costs.total ?? null;
  const missing = revenue === null && operatingCosts === null
    ? "Needs reported revenue and operating costs"
    : revenue === null ? "Needs reported revenue"
      : operatingCosts === null ? "Needs reported operating costs" : null;
  const whatsLeft = revenue !== null && operatingCosts !== null ? revenue - operatingCosts : null;
  const margin = whatsLeft !== null && revenue !== null && revenue !== 0 ? whatsLeft / revenue * 100 : null;
  return { revenue, operatingCosts, whatsLeft, margin, missing,
    marginUnavailable: missing ?? (revenue === 0 ? "Undefined when revenue is zero" : null) };
}
