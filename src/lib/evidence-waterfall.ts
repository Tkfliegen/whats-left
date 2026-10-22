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
  const knownCosts = evidence.costs.items.filter(
    (item): item is typeof item & { amount: number } => item.amount !== null && Number.isFinite(item.amount),
  );
  const bars: WaterfallBar[] = [
    { label: "Revenue", value: evidence.revenue.total, bottom: Math.min(0, evidence.revenue.total ?? 0), total: true },
  ];
  let running = evidence.revenue.total ?? 0;
  for (const item of knownCosts) {
    const next = running - item.amount;
    bars.push({
      label: costLabel(item.name), value: item.amount, total: false,
      // Without reported revenue, show known amounts from zero rather than imply a balance.
      bottom: evidence.revenue.total === null ? 0 : Math.min(running, next),
    });
    running = next;
  }
  const min = Math.min(0, ...bars.map(bar => bar.bottom));
  const max = Math.max(0, ...bars.map(bar => bar.bottom + Math.abs(bar.value ?? 0)));
  return {
    bars,
    min,
    range: Math.max(max - min, 1),
    unitemized: evidence.costs.items.some(item => item.amount === null)
      || (evidence.costs.total !== null && knownCosts.reduce((sum, item) => sum + item.amount, 0) < evidence.costs.total),
  };
}
