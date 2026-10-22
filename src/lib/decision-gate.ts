import { isEvidence } from "../app/api/analyze/evidence/provenance";
import { matchesSchema } from "../app/api/analyze/evidence/evidence";
import { normalizeLeak, scenarioSchema } from "../app/api/analyze/scenarios/scenarios";
import type { ControlledChange } from "../types/scenarios";
import type { ComparisonGapStatus, DecisionCandidate, DecisionGateReason, DecisionGateRequest, DecisionGateResponse, DecisionGateState, PolicyRequiredInput } from "../types/decision-gate";

const text = { type: "string" };
const number = { type: "number" };
const texts = { type: "array", items: text };
const controlledChanges = scenarioSchema.properties.scenarios.items.properties.controlled_changes;
const calculationSchema = {
  type: "object",
  properties: {
    formula_id: text,
    inputs: {
      type: "array", items: {
        type: "object", properties: { name: text, value: number, unit: text, source_ref: text },
        required: ["name", "value", "unit", "source_ref"], additionalProperties: false as const,
      },
    },
    baseline_value: number, projected_value: number, impact_value: number, currency: text, period: text,
  },
  required: ["formula_id", "inputs", "baseline_value", "projected_value", "impact_value", "currency", "period"],
  additionalProperties: false as const,
};
const resultSchema = {
  type: "object",
  properties: {
    scenario_title: text, target_leak: text, controlled_changes: controlledChanges,
    status: { type: "string", enum: ["calculable", "not_calculable_yet"] },
    calculation: { ...calculationSchema, type: ["object", "null"] }, missing_inputs: texts, notes: texts,
  },
  required: ["scenario_title", "target_leak", "controlled_changes", "status", "calculation", "missing_inputs", "notes"],
  additionalProperties: false as const,
};
const nonblank = (value: string) => value.trim().length > 0;
const changesValid = (changes: ControlledChange[]) => changes.length > 0 && changes.every(change =>
  nonblank(change.variable) && nonblank(change.unit) && (change.change_type !== "absolute_target" || change.from !== null));
const changesEqual = (left: ControlledChange[], right: ControlledChange[]) => left.length === right.length
  && left.every((change, index) => {
    const other = right[index];
    return change.variable === other.variable && change.change_type === other.change_type
      && change.from === other.from && change.value === other.value && change.unit === other.unit;
  });

export function isDecisionGateRequest(value: unknown): value is DecisionGateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["evidence", "scenarios", "simulation"].includes(key))
    || !isEvidence(body.evidence) || !matchesSchema(body.scenarios, scenarioSchema)
    || !matchesSchema(body.simulation, {
      type: "object", properties: { results: { type: "array", items: resultSchema } },
      required: ["results"], additionalProperties: false,
    })) return false;
  const input = body as DecisionGateRequest;
  const seen = new Set<string>();
  for (const scenario of input.scenarios.scenarios) {
    const key = normalizeLeak(scenario.target_leak);
    if (!nonblank(scenario.title) || !key || seen.has(key) || !changesValid(scenario.controlled_changes)
      || scenario.available_input_refs.length === 0 || !scenario.available_input_refs.every(nonblank)
      || !scenario.missing_calculation_inputs.every(nonblank)) return false;
    seen.add(key);
  }
  for (const item of input.scenarios.not_simulation_ready) {
    const key = normalizeLeak(item.target_leak);
    if (!key || seen.has(key) || !nonblank(item.reason)
      || item.missing_decision_input_categories.length === 0 || !item.missing_decision_input_categories.every(nonblank)) return false;
    seen.add(key);
  }
  const results = input.simulation.results;
  if (results.length !== input.scenarios.scenarios.length) return false;
  // Exactly one result per scenario, and no result for a non-ready leak.
  for (const scenario of input.scenarios.scenarios) {
    const matches = results.filter(item => item.scenario_title === scenario.title && item.target_leak === scenario.target_leak);
    if (matches.length !== 1 || !changesEqual(matches[0].controlled_changes, scenario.controlled_changes)) return false;
  }
  for (const result of results) {
    if (!result.notes.every(nonblank)) return false;
    if (result.status === "not_calculable_yet") {
      if (result.calculation !== null || result.missing_inputs.length === 0 || !result.missing_inputs.every(nonblank)) return false;
    } else {
      const calc = result.calculation;
      if (!calc || result.missing_inputs.length !== 0 || !nonblank(calc.formula_id)
        || !/^[A-Z]{3}$/.test(calc.currency) || !nonblank(calc.period)
        || calc.impact_value < 0 || calc.baseline_value < 0 || calc.projected_value < 0
        || calc.inputs.length === 0 || !calc.inputs.every(item => nonblank(item.name) && nonblank(item.unit) && nonblank(item.source_ref))) return false;
    }
  }
  return true;
}

const policyCategories = ["implementation_cost", "operational_constraints"] as const;
const policyInputsSchema = {
  type: "array", items: {
    type: "object",
    properties: {
      category: { type: "string", enum: [...policyCategories] },
      reason_code: { type: "string", enum: ["CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT"] },
    },
    required: ["category", "reason_code"], additionalProperties: false as const,
  },
};
type PolicyContext = Pick<DecisionGateResponse, "decision_gate" | "comparison_gap_status" | "reason_codes">;
const closeCallPolicyApplies = (context: PolicyContext) => context.decision_gate === "needs_more_data"
  && context.comparison_gap_status === "below_threshold"
  && context.reason_codes.length === 1 && context.reason_codes[0] === "close_call_below_threshold";

// Can also check a supplied policy field at a later backend boundary. Reject
// duplicates/unknown values; never deduplicate, rewrite or repair external data.
export function validatePolicyRequiredInputs(value: unknown, context: PolicyContext): value is PolicyRequiredInput[] {
  if (!matchesSchema(value, policyInputsSchema)) return false;
  const inputs = value as PolicyRequiredInput[];
  if (!closeCallPolicyApplies(context)) return inputs.length === 0;
  return inputs.length === policyCategories.length
    && new Set(inputs.map(input => input.category)).size === policyCategories.length
    && policyCategories.every(category => inputs.some(input => input.category === category));
}

// These are the only calculator formulas whose impact meaning is approved here.
// Unknown formula IDs do not gain equivalence through names or prose.
const costReductionFormulas = new Set(["LABOR_HEADCOUNT_DELTA", "INGREDIENT_WASTE_RATE_TARGET"]);

// No rounding before the 10% test. Compare canonical decimal representations of
// the supplied finite numbers using exact integers to avoid binary boundary
// artifacts (e.g. 0.30 vs 0.27). Equivalent to (top-second)/top >= 0.10 for top>0.
function decimal(value: number): { coefficient: bigint; exponent: number } {
  const [mantissa, exponent = "0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { coefficient: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}
export function compareImpactGap(topImpact: number, secondImpact: number): Exclude<ComparisonGapStatus, "not_applicable"> {
  if (![topImpact, secondImpact].every(Number.isFinite) || topImpact <= 0 || secondImpact < 0 || secondImpact > topImpact) {
    throw new TypeError("Finite nonnegative ordered impacts with positive top impact are required.");
  }
  const top = decimal(topImpact), second = decimal(secondImpact);
  const exponent = Math.min(top.exponent, second.exponent);
  const a = top.coefficient * BigInt(10) ** BigInt(top.exponent - exponent);
  const b = second.coefficient * BigInt(10) ** BigInt(second.exponent - exponent);
  return (a - b) * BigInt(10) < a ? "below_threshold" : "meets_or_exceeds_threshold";
}

export function evaluateDecisionGate(value: unknown): DecisionGateResponse {
  if (!isDecisionGateRequest(value)) throw new TypeError("Invalid Decision Gate request.");
  const input = value;
  const candidates: DecisionCandidate[] = input.scenarios.scenarios.map((scenario, index) => {
    const result = input.simulation.results.find(item => item.scenario_title === scenario.title && item.target_leak === scenario.target_leak)!;
    const common = { candidate_id: `candidate_${String(index + 1).padStart(2, "0")}`, scenario_title: scenario.title, target_leak: scenario.target_leak };
    return result.status === "calculable"
      ? { ...common, scenario_status: "calculable", verified_impact: result.calculation.impact_value,
        currency: result.calculation.currency, period: result.calculation.period,
        impact_metric: costReductionFormulas.has(result.calculation.formula_id) ? "cost_reduction" : null }
      : { ...common, scenario_status: "not_calculable_yet", verified_impact: null, currency: null, period: null, impact_metric: null };
  });
  const missing = [...new Set(input.simulation.results.flatMap(item => item.missing_inputs))];
  const finish = (decision_gate: DecisionGateState, reason_codes: DecisionGateReason[], comparison_gap_status: ComparisonGapStatus = "not_applicable", top_candidate_id: string | null = null): DecisionGateResponse => {
    const context = { decision_gate, reason_codes, comparison_gap_status };
    const policy_required_inputs: PolicyRequiredInput[] = closeCallPolicyApplies(context)
      ? policyCategories.map(category => ({ category, reason_code: "CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT" })) : [];
    if (!validatePolicyRequiredInputs(policy_required_inputs, context)) {
      throw new Error("Invalid deterministic policy-input contract.");
    }
    return {
      ...context, candidates, top_candidate_id,
      missing_decision_inputs: candidates.length === 0
        ? [...new Set(input.scenarios.not_simulation_ready.flatMap(item => item.missing_decision_input_categories))] : missing,
      policy_required_inputs,
      not_simulation_ready: structuredClone(input.scenarios.not_simulation_ready),
    };
  };
  if (candidates.length === 0) return finish("no_actionable_scenario", ["no_authorized_scenarios"]);
  const calculated = candidates.filter((item): item is Extract<DecisionCandidate, { scenario_status: "calculable" }> => item.scenario_status === "calculable");
  if (calculated.length === 0) return finish("needs_more_data", ["no_calculable_scenarios"]);
  if (calculated.length !== candidates.length) return finish("needs_more_data", ["unresolved_authorized_scenarios"]);
  const comparability: DecisionGateReason[] = [];
  if (new Set(calculated.map(item => item.currency)).size !== 1) comparability.push("currency_mismatch");
  if (new Set(calculated.map(item => item.period)).size !== 1) comparability.push("period_mismatch");
  if (calculated.some(item => item.impact_metric !== "cost_reduction")) comparability.push("unsupported_impact_metric");
  if (comparability.length) return finish("needs_more_data", comparability);
  // Equal impacts preserve original candidate order; no business tie-break is inferred.
  const ordered = [...calculated].sort((a, b) => b.verified_impact - a.verified_impact);
  const top = ordered[0];
  if (top.verified_impact <= 0) return finish("needs_more_data", ["non_positive_top_impact"]);
  if (ordered.length === 1) return finish("action_allowed", ["single_calculable_candidate"], "not_applicable", top.candidate_id);
  const gap = compareImpactGap(top.verified_impact, ordered[1].verified_impact);
  return gap === "below_threshold"
    ? finish("needs_more_data", ["close_call_below_threshold"], gap, top.candidate_id)
    : finish("action_allowed", ["comparison_gap_meets_threshold"], gap, top.candidate_id);
}
