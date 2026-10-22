import { baselineBusinessSummary } from "@/lib/baseline-business-summary";
import type { Evidence } from "@/types/evidence";

export type WaterfallBar = {
  label: string;
  value: number | null;
  bottom: number;
  total: boolean;
};

export function costLabel(name: string): string {
  const aliases: Record<string, string> = {
    labor: "Labor",
    ingredients: "Ingredients",
    rent_and_utilities: "Rent & utilities",
    delivery_platform_fees: "Delivery fees",
  };
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return Object.hasOwn(aliases, key) ? aliases[key] : name.trim().replace(/_/g, " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

// Original sample data is used only when no real Evidence payload exists.
const costs = [ ["Payroll", 31200], ["Rent", 18000], ["Ingredients", 21400], ["Delivery fees", 8900], ["Waste", 5100], ["Utilities", 4600], ["Maintenance", 3800], ["Other", 2800] ] as const;

export function evidenceWaterfall(evidence: Evidence | null) {
  if (evidence === null) {
    const bars: WaterfallBar[] = [{ label: "Revenue", value: 100000, bottom: 0, total: true }, ...costs.map(([label, value], index) => ({ label, value, bottom: 100000 - costs.slice(0, index + 1).reduce((sum, cost) => sum + cost[1], 0), total: false })), { label: "Left", value: 4200, bottom: 0, total: true }];
    return { bars, min: 0, range: 100000, unitemized: false };
  }
  const baseline = baselineBusinessSummary(evidence);
  const bars: WaterfallBar[] = [
    { label: "Revenue", value: baseline.revenue, bottom: Math.min(0, baseline.revenue ?? 0), total: true },
    { label: "Operating Costs", value: baseline.operatingCosts,
      bottom: baseline.whatsLeft === null ? Math.min(0, baseline.operatingCosts ?? 0) : Math.min(baseline.revenue!, baseline.whatsLeft),
      total: baseline.whatsLeft === null },
  ];
  if (baseline.whatsLeft !== null) {
    bars.push({ label: "What’s Left", value: baseline.whatsLeft, bottom: Math.min(0, baseline.whatsLeft), total: true });
  }
  const min = Math.min(0, ...bars.map(bar => bar.bottom));
  const max = Math.max(0, ...bars.map(bar => bar.bottom + Math.abs(bar.value ?? 0)));
  return { bars, min, range: Math.max(max - min, 1), unitemized: false };
}
