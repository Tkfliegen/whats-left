import type { Evidence } from "./evidence";
import type { ScenarioResult } from "./scenarios";
import type { ScenarioCalculation, SimulationResult } from "./scenario-calculator";

// Compatible with SimulationResponse. Unknown future formula IDs are retained
// as unsupported metrics, never assumed equivalent to verified cost reduction.
type GateCalculableResult = Omit<Extract<SimulationResult, { status: "calculable" }>, "calculation"> & {
  calculation: Omit<ScenarioCalculation, "formula_id"> & { formula_id: string };
};
export type DecisionGateRequest = {
  evidence: Evidence;
  scenarios: ScenarioResult;
  simulation: {
    results: Array<GateCalculableResult | Extract<SimulationResult, { status: "not_calculable_yet" }>>;
  };
};
export type DecisionGateState = "needs_more_data" | "action_allowed" | "no_actionable_scenario";
export type ComparisonGapStatus = "below_threshold" | "meets_or_exceeds_threshold" | "not_applicable";
export type DecisionGateReason =
  | "no_authorized_scenarios" | "no_calculable_scenarios" | "unresolved_authorized_scenarios"
  | "currency_mismatch" | "period_mismatch" | "unsupported_impact_metric"
  | "non_positive_top_impact" | "single_calculable_candidate"
  | "close_call_below_threshold" | "comparison_gap_meets_threshold";
export type DecisionCandidate = {
  candidate_id: string;
  scenario_title: string;
  target_leak: string;
} & (
  | { scenario_status: "calculable"; verified_impact: number; currency: string; period: string; impact_metric: "cost_reduction" | null }
  | { scenario_status: "not_calculable_yet"; verified_impact: null; currency: null; period: null; impact_metric: null }
);
export type PolicyRequiredInputCategory = "implementation_cost" | "operational_constraints";
export type PolicyRequiredInput = {
  category: PolicyRequiredInputCategory;
  reason_code: "CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT";
};
export type DecisionGateResponse = {
  decision_gate: DecisionGateState;
  reason_codes: DecisionGateReason[];
  comparison_gap_status: ComparisonGapStatus;
  candidates: DecisionCandidate[];
  top_candidate_id: string | null;
  missing_decision_inputs: string[];
  policy_required_inputs: PolicyRequiredInput[];
  not_simulation_ready: ScenarioResult["not_simulation_ready"];
};
