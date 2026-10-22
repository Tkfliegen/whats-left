import type { LeakResult } from "./leaks";
import type { DecisionGateRequest, DecisionGateResponse } from "./decision-gate";

export type DecisionRequest = DecisionGateRequest & {
  leaks: LeakResult;
  decision_gate: DecisionGateResponse;
};
export type DecisionResult = {
  decision_status: "actionable" | "needs_more_data";
  recommendation: {
    type: "business_action" | "collect_data";
    candidate_id: string | null;
    title: string;
    rationale: string;
  };
  comparison: Array<{
    candidate_id: string | null;
    target_leak: string;
    scenario_status: "calculable" | "not_calculable_yet" | "not_simulation_ready";
    assessment: string;
    verified_impact: number | null;
    currency: string | null;
  }>;
  priority_inputs: Array<{
    source_type: "upstream_missing_input" | "policy_required_input";
    key: string;
    why_it_matters: string;
  }>;
  confidence: "low" | "medium" | "high";
};
export type DecisionResponse = { decision: DecisionResult };
