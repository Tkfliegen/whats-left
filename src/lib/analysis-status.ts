import type { DecisionGateResponse } from "@/types/decision-gate";
import type { DecisionResult } from "@/types/decision";

export const requirementLabels = {
  tuesday_evening_sales: "Tuesday evening sales or revenue for the relevant reporting period",
  tuesday_evening_staffing_cost: "Tuesday evening staffing cost for the same reporting period",
  staffing_test_permission: "Explicit management permission to test the staffing reduction",
  unchanged_schedule: "Confirmation that the rest of the relevant staffing schedule will remain unchanged",
} as const;
export type MissingRequirement = keyof typeof requirementLabels;
export type EvidenceGuidance = { missing_requirements: MissingRequirement[] };
export type AnalysisFailure = "verification" | "conflict" | "temporary_failure" | "unclassified_failure";
export type AnalysisNotice = { category: AnalysisFailure | "complete_confident" | "more_data_needed";
  heading: string; explanation: string; items: string[]; next: string };

// Display metadata only; unknown fields never become prose or authorization.
export function readEvidenceGuidance(value: unknown): EvidenceGuidance | null {
  if (!value || typeof value !== "object" || !("missing_requirements" in value)
    || !Array.isArray(value.missing_requirements)) return null;
  const missing = value.missing_requirements.filter((key): key is MissingRequirement =>
    typeof key === "string" && Object.hasOwn(requirementLabels, key));
  return { missing_requirements: [...new Set(missing)] };
}

export async function failureFromResponse(response: Response): Promise<AnalysisFailure> {
  let error: unknown;
  try { error = (await response.json())?.error; } catch { /* Fall back to the HTTP status, never raw response text. */ }
  if (error === "Evidence currency conflicts with the explicit source currency or is unsupported.") return "conflict";
  if (error === "Evidence authorization atoms have invalid source support."
    || error === "Evidence authorization records have invalid source support."
    || (typeof error === "string" && /^(?:Leak|Scenario analysis|Decision).*rejected.*validation/i.test(error))) return "verification";
  if (typeof error === "string" && /^(?:Evidence|Leak|Scenario analysis|Decision).*provider.*(?:failed|invalid|unavailable)/i.test(error)) return "temporary_failure";
  if (response.status === 408 || response.status === 429 || response.status === 503 || response.status === 504) return "temporary_failure";
  if (response.status === 400) return "verification";
  return "unclassified_failure";
}

export function analysisNotice({ failure, complete, guidance, gate, decision }: {
  failure?: AnalysisFailure | null; complete: boolean; guidance?: EvidenceGuidance | null;
  gate?: DecisionGateResponse | null; decision?: DecisionResult | null;
}): AnalysisNotice | null {
  if (failure === "temporary_failure") return { category: failure, heading: "Analysis temporarily unavailable",
    explanation: "We couldn't complete the AI analysis this time. Your inputs are preserved.", items: [], next: "Please try again." };
  if (failure === "verification") return { category: failure, heading: "Some information couldn't be verified",
    explanation: "We couldn't verify the information supporting this analysis against your original details.", items: [],
    next: "Review the figures and supporting statements, clarify any unclear details, then run the analysis again." };
  if (failure === "conflict" || (complete && gate?.reason_codes.some(code => code === "currency_mismatch" || code === "period_mismatch"))) {
    const currency = failure === "conflict" || gate?.reason_codes.includes("currency_mismatch");
    return { category: "conflict", heading: "Some information needs checking",
      explanation: "The analysis found information that could not be used consistently.",
      items: [currency ? "Review the currency used for your amounts and any currency declaration" : "Review the reporting periods used for the results being compared"],
      next: "Clarify these details, then run the analysis again." };
  }
  if (failure) return { category: "unclassified_failure", heading: "Analysis couldn't be completed",
    explanation: "The analysis stopped before a result could be verified. Your inputs are preserved.", items: [],
    next: "Review your details. If they look correct, try again later." };
  if (!complete || !decision) return null;
  if (decision.decision_status === "actionable" && gate?.decision_gate === "action_allowed") return {
    category: "complete_confident", heading: "Action recommendation ready",
    explanation: "The analysis completed with sufficient verified information to support a recommendation.", items: [], next: "Review the recommendation below." };
  const items: string[] = [];
  for (const key of guidance?.missing_requirements ?? []) if (Object.hasOwn(requirementLabels, key)) items.push(requirementLabels[key]);
  for (const item of gate?.policy_required_inputs ?? []) {
    if (item.category === "implementation_cost") items.push("Implementation cost for the options being compared");
    if (item.category === "operational_constraints") items.push("Operational constraints for the options being compared");
  }
  return { category: "more_data_needed", heading: "More data needed before a confident decision",
    explanation: items.length ? "The analysis completed safely, but we still need:" : "The analysis completed safely, but the supplied information does not support a confident action recommendation.",
    items: [...new Set(items)].slice(0, 4), next: items.length ? "Add these details and run the analysis again." : "Review the missing information in the results below before adding further details and running again." };
}
