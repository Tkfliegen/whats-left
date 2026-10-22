import { isEvidence } from "../app/api/analyze/evidence/provenance";
import { matchesSchema } from "../app/api/analyze/evidence/evidence";
import { scenarioSchema, validateScenarioResult } from "../app/api/analyze/scenarios/scenarios";
import type { ControlledChange } from "../types/scenarios";
import type { CalculationFact, CalculationInput, ScenarioCalculation, SimulationRequest, SimulationResponse } from "../types/scenario-calculator";

const text = { type: "string" };
const factSchema = {
  type: "object",
  properties: {
    concept: { type: "string", enum: ["baseline_headcount", "labor_cost_per_worker", "ingredient_purchases"] },
    scope: { type: "string", enum: ["tuesday_evening", "ingredient_waste"] },
    value: { type: "number" },
    unit: { type: "string", enum: ["persons", "currency_per_person", "currency"] },
    period: text,
    currency: { type: ["string", "null"] },
  },
  required: ["concept", "scope", "value", "unit", "period", "currency"],
  additionalProperties: false as const,
};
const inputFactSchema = {
  type: "object", properties: { id: text, source: text, fact: text },
  required: ["id", "source", "fact"], additionalProperties: false as const,
};

export function isSimulationRequest(value: unknown): value is SimulationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["evidence", "scenarios", "input_facts"].includes(key))
    || !isEvidence(body.evidence) || !matchesSchema(body.scenarios, scenarioSchema)
    || !Array.isArray(body.input_facts)
    || !body.input_facts.every(fact => matchesSchema(fact, inputFactSchema))) return false;
  const request = body as SimulationRequest;
  const ids = request.input_facts.map(fact => fact.id);
  if (new Set(ids).size !== ids.length || request.input_facts.some(fact =>
    (!/^input_[0-9]+$/.test(fact.id) && !request.evidence.provenance?.items.some(item => item.id === fact.id && item.source === fact.source && item.text === fact.fact)) || !fact.source.trim() || !fact.fact.trim())) return false;
  // Facts explicitly marked calculation_inputs are structured, never prose. Reject malformed data.
  for (const fact of request.input_facts.filter(fact => fact.source.startsWith("calculation_inputs."))) {
    try {
      if (!matchesSchema(JSON.parse(fact.fact), factSchema)) return false;
    } catch { return false; }
  }
  const titles = [...request.scenarios.scenarios, ...request.scenarios.not_simulation_ready].map(item => item.target_leak);
  return validateScenarioResult(request.scenarios, request.input_facts, titles);
}

type NumericFact = CalculationFact & { source_ref: string };
type Context = { request: SimulationRequest; change: ControlledChange; changeRef: string; facts: NumericFact[] };
type Attempt = { missing: string[]; calculation: ScenarioCalculation | null };
type Formula = {
  formula_id: ScenarioCalculation["formula_id"];
  aliases: readonly string[];
  change_type: ControlledChange["change_type"];
  unit: string;
  required_inputs: readonly string[];
  calculate(context: Context): Attempt;
};
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

// Percent inputs are 0..100; division by 100 occurs only inside the waste formula.
// Round final money only, to nearest cent; ties away from zero. No intermediate rounding.
export function roundCurrency(value: number): number {
  const absolute = Math.abs(value);
  const rounded = Math.round((absolute + Number.EPSILON * Math.max(1, absolute)) * 100) / 100;
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
}
const fail = (...missing: string[]): Attempt => ({ missing, calculation: null });
const used = (name: string, value: number, unit: string, source_ref: string): CalculationInput => ({ name, value, unit, source_ref });

function environment({ request }: Context): string[] {
  const missing: string[] = [];
  if (!request.evidence.period?.trim()) missing.push("Affected period");
  if (!request.evidence.currency || !/^[A-Z]{3}$/.test(request.evidence.currency)) missing.push("Explicit currency code for monetary output");
  return missing;
}
function find(context: Context, concept: CalculationFact["concept"], scope: CalculationFact["scope"], unit: CalculationFact["unit"]) {
  const matches = context.facts.filter(fact => fact.concept === concept && fact.scope === scope);
  if (matches.length !== 1) return undefined; // Never pick among ambiguous or conflicting values.
  const fact = matches[0];
  if (fact.unit !== unit || fact.period !== context.request.evidence.period || fact.value < 0
    || (unit === "persons" ? fact.currency !== null : fact.currency !== context.request.evidence.currency)) return undefined;
  return fact;
}
function finish(context: Context, formula_id: ScenarioCalculation["formula_id"], inputs: CalculationInput[], baseline: number, projected: number): Attempt {
  const impact = baseline - projected; // Positive = cost reduction; negative = cost increase.
  if (![baseline, projected, impact].every(value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100)) {
    return fail("Numeric inputs within the supported currency calculation range");
  }
  return { missing: [], calculation: {
    formula_id, inputs, baseline_value: roundCurrency(baseline), projected_value: roundCurrency(projected),
    impact_value: roundCurrency(impact), currency: context.request.evidence.currency!, period: context.request.evidence.period!,
  } };
}

export const formulaRegistry: readonly Formula[] = [
  {
    formula_id: "LABOR_HEADCOUNT_DELTA",
    aliases: ["tuesday evening headcount", "tuesday_evening_headcount", "tuesday evening 6 pm to 10 pm headcount"],
    change_type: "delta", unit: "persons",
    required_inputs: ["Baseline Tuesday evening headcount (persons)", "Labor cost per worker for the affected period (currency_per_person)", "Signed headcount delta (persons)", "Matching affected period and currency"],
    calculate(context) {
      const missing = environment(context);
      const baseline = find(context, "baseline_headcount", "tuesday_evening", "persons");
      const workerCost = find(context, "labor_cost_per_worker", "tuesday_evening", "currency_per_person");
      if (!baseline) missing.push("Authoritative baseline Tuesday evening headcount in persons for the affected period");
      if (!workerCost) missing.push("Authoritative labor cost per worker for Tuesday evenings in the affected period and currency");
      if (missing.length || !baseline || !workerCost) return { missing, calculation: null };
      const change = context.change;
      if (!Number.isSafeInteger(baseline.value) || !Number.isSafeInteger(change.value)
        || !Number.isSafeInteger(baseline.value + change.value) || baseline.value + change.value < 0
        || (change.from !== null && change.from !== baseline.value)) {
        return fail("Compatible integer baseline and delta, with non-negative projected headcount");
      }
      return finish(context, "LABOR_HEADCOUNT_DELTA", [
        used("baseline_headcount", baseline.value, baseline.unit, baseline.source_ref),
        used("labor_cost_per_worker", workerCost.value, workerCost.unit, workerCost.source_ref),
        used("headcount_delta", change.value, change.unit, `${context.changeRef}.value`),
      ], baseline.value * workerCost.value, (baseline.value + change.value) * workerCost.value);
    },
  },
  {
    formula_id: "INGREDIENT_WASTE_RATE_TARGET",
    aliases: ["ingredient waste rate", "ingredient_waste_rate"],
    change_type: "absolute_target", unit: "percent",
    required_inputs: ["Ingredient purchases for the affected period (currency)", "Current waste rate (percent)", "Target waste rate (percent)", "Matching affected period and currency"],
    calculate(context) {
      const missing = environment(context);
      const purchases = find(context, "ingredient_purchases", "ingredient_waste", "currency");
      if (!purchases) missing.push("Authoritative ingredient purchases for the affected period and currency; ingredient cost is not equivalent");
      const change = context.change;
      if (change.from === null || change.from < 0 || change.from > 100 || change.value < 0 || change.value > 100) {
        missing.push("Current and target waste rates between 0 and 100 percent");
      }
      if (missing.length || !purchases || change.from === null) return { missing, calculation: null };
      return finish(context, "INGREDIENT_WASTE_RATE_TARGET", [
        used("ingredient_purchases", purchases.value, purchases.unit, purchases.source_ref),
        used("current_waste_rate", change.from, change.unit, `${context.changeRef}.from`),
        used("target_waste_rate", change.value, change.unit, `${context.changeRef}.value`),
      ], purchases.value * (change.from / 100), purchases.value * (change.value / 100));
    },
  },
];

export function calculateScenarios(value: unknown): SimulationResponse {
  if (!isSimulationRequest(value)) throw new TypeError("Invalid simulation request.");
  const facts: NumericFact[] = value.input_facts.filter(fact => fact.source.startsWith("calculation_inputs."))
    .map(fact => ({ ...JSON.parse(fact.fact) as CalculationFact, source_ref: fact.id }));
  return { results: value.scenarios.scenarios.map((scenario, index) => {
    const base = { scenario_title: scenario.title, target_leak: scenario.target_leak,
      controlled_changes: structuredClone(scenario.controlled_changes), notes: [] as string[] };
    let attempt: Attempt;
    if (scenario.controlled_changes.length !== 1) {
      attempt = fail("Approved formula for the combined controlled changes");
    } else {
      const change = scenario.controlled_changes[0];
      const formula = formulaRegistry.find(item => item.aliases.includes(normalize(change.variable)));
      if (!formula) attempt = fail("Approved deterministic formula for this controlled variable");
      else if (formula.change_type !== change.change_type || formula.unit !== change.unit) {
        attempt = fail(`Supported change type ${formula.change_type} and unit ${formula.unit} for ${formula.formula_id}`);
      } else attempt = formula.calculate({ request: value, change, facts,
        changeRef: `scenarios.scenarios[${index}].controlled_changes[0]` });
    }
    return attempt.calculation
      ? { ...base, status: "calculable" as const, calculation: attempt.calculation, missing_inputs: [] as [] }
      : { ...base, status: "not_calculable_yet" as const, calculation: null, missing_inputs: attempt.missing };
  }) };
}
