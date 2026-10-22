import type { ScenarioResult } from "@/types/scenarios";

const explanations = {
  no_eligible_authorized_change: {
    reason: "No eligible authorized change is available for this finding.",
    missing_decision_input_categories: ["An eligible authorized change"],
  },
} as const;

// Apply only after structural and semantic authorization validation succeeds.
// That accepted state establishes eligibility absence, not its underlying cause.
// No facts, model prose, business numbers or source text enter the template.
export function ownAbstentionExplanations(result: ScenarioResult): ScenarioResult {
  const explanation = explanations.no_eligible_authorized_change;
  return {
    scenarios: result.scenarios,
    not_simulation_ready: result.not_simulation_ready.map(({ target_leak }) => ({
      target_leak,
      reason: explanation.reason,
      missing_decision_input_categories: [...explanation.missing_decision_input_categories],
    })),
  };
}
