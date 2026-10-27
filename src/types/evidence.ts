export type EvidenceSource = { id: string; source: string; text: string };
export type CitableFact = { id: string; text: string; source_refs: string[] };
export type AuthorizationRecord = {
  intervention: "headcount_reduction" | "waste_rate_target";
  scope: "tuesday_evening_6pm_10pm" | "ingredient_waste";
  operation: "delta" | "absolute_target";
  from: number | null;
  value: number;
  unit: "persons" | "percent";
  permission: "explicit" | "absent" | "denied";
  permission_source_refs: string[];
  constraint: "affected_scope_only" | "rest_schedule_unchanged" | "none";
  constraint_source_refs: string[];
  supporting_facts: Array<{
    role: "sales" | "staffing_cost" | "current_waste_rate" | "target_waste_rate";
    value: number;
    unit: "currency" | "percent";
    period: "month";
    currency: string | null;
    source_refs: string[];
  }>;
};
type SourceBound = { source_refs: string[] };
type LaborScope = { scope: "tuesday_evening_6pm_10pm" };
type WasteScope = { scope: "ingredient_waste" };
export type AuthorizationAtom = SourceBound & (
  | (LaborScope & { kind: "scoped_sales" | "scoped_staffing_cost"; period: "month"; amount: number; currency: string })
  | (LaborScope & { kind: "headcount_reduction_permission"; operation: "delta"; value: -1; unit: "persons"; permission: "explicit" })
  | (LaborScope & { kind: "schedule_constraint"; intervention: "headcount_reduction"; constraint: "rest_schedule_unchanged" })
  | (WasteScope & { kind: "current_waste_rate" | "waste_target_rate"; value: number; unit: "percent" })
  | (WasteScope & { kind: "waste_reduction_permission"; from: 9; value: 5; unit: "percent"; permission: "explicit" })
);

export type CalculationAnchor = { source_ref: string; quote: string };
export type LaborCalculationSupport = {
  concept: "baseline_headcount" | "labor_cost_per_worker";
  scope: "tuesday_evening";
  period: string;
  support: { value: CalculationAnchor; unit: CalculationAnchor; scope: CalculationAnchor;
    period: CalculationAnchor; currency: CalculationAnchor | null };
};
export type TrustedLaborCalculationFact = LaborCalculationSupport & {
  value: number; unit: "persons" | "currency_per_person"; currency: string | null;
};
export type EvidenceProvenance = { source_input: string; items: EvidenceSource[]; citable_facts: CitableFact[];
  authorization_records?: AuthorizationRecord[]; calculation_facts?: TrustedLaborCalculationFact[] };

export type Evidence = {
  provenance?: EvidenceProvenance;
  business_type: string | null;
  period: string | null;
  currency: string | null;
  revenue: {
    total: number | null;
    items: Array<{ name: string; amount: number | null; source_text: string }>;
  };
  costs: {
    total: number | null;
    items: Array<{ name: string; amount: number | null; reported_category: string | null; source_text: string }>;
  };
  facts: string[];
  assumptions: string[];
  missing_information: string[];
  confidence: "low" | "medium" | "high";
};

// Extraction-only support for the two whole-business totals; not downstream provenance.
export type BusinessTotalSupport = {
  field: "revenue.total" | "costs.total";
  value: number;
  scope: "whole_business";
  period: string;
  currency: string;
  source_refs: string[];
};
