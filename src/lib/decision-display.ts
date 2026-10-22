import type { DecisionResponse } from "@/types/decision";
import type { DecisionGateResponse } from "@/types/decision-gate";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const nullableText = (value: unknown) => value === null || typeof value === "string";
const nullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));

// Transport shape checks only. All ranking, policy and semantic validation live
// on the server. These checks never reconstruct or change returned objects.
export function isDecisionGateResponse(value: unknown): value is DecisionGateResponse {
  return record(value) && ["needs_more_data", "action_allowed", "no_actionable_scenario"].includes(String(value.decision_gate))
    && ["below_threshold", "meets_or_exceeds_threshold", "not_applicable"].includes(String(value.comparison_gap_status))
    && nullableText(value.top_candidate_id) && strings(value.reason_codes) && strings(value.missing_decision_inputs)
    && Array.isArray(value.candidates) && value.candidates.every(item => record(item)
      && typeof item.candidate_id === "string" && typeof item.scenario_title === "string" && typeof item.target_leak === "string"
      && ["calculable", "not_calculable_yet"].includes(String(item.scenario_status))
      && nullableNumber(item.verified_impact) && nullableText(item.currency) && nullableText(item.period) && nullableText(item.impact_metric))
    && Array.isArray(value.policy_required_inputs) && value.policy_required_inputs.every(item => record(item)
      && typeof item.category === "string" && typeof item.reason_code === "string")
    && Array.isArray(value.not_simulation_ready) && value.not_simulation_ready.every(item => record(item)
      && typeof item.target_leak === "string" && typeof item.reason === "string" && strings(item.missing_decision_input_categories));
}

export function isDecisionResponse(value: unknown): value is DecisionResponse {
  if (!record(value) || !record(value.decision)) return false;
  const result = value.decision, recommendation = result.recommendation;
  return ["actionable", "needs_more_data"].includes(String(result.decision_status))
    && ["low", "medium", "high"].includes(String(result.confidence))
    && record(recommendation) && ["business_action", "collect_data"].includes(String(recommendation.type))
    && nullableText(recommendation.candidate_id) && typeof recommendation.title === "string" && typeof recommendation.rationale === "string"
    && Array.isArray(result.comparison) && result.comparison.every(item => record(item)
      && nullableText(item.candidate_id) && typeof item.target_leak === "string" && typeof item.assessment === "string"
      && ["calculable", "not_calculable_yet", "not_simulation_ready"].includes(String(item.scenario_status))
      && nullableNumber(item.verified_impact) && nullableText(item.currency))
    && Array.isArray(result.priority_inputs) && result.priority_inputs.every(item => record(item)
      && ["upstream_missing_input", "policy_required_input"].includes(String(item.source_type))
      && typeof item.key === "string" && typeof item.why_it_matters === "string");
}

export const decisionInputLabel = (key: string) => key === "implementation_cost" ? "Implementation cost"
  : key === "operational_constraints" ? "Operational constraints" : key;
