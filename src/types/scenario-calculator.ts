import type { Evidence } from "./evidence";
import type { ControlledChange, ScenarioInputFact, ScenarioResult } from "./scenarios";

// Optional numeric facts use this exact JSON structure in ScenarioInputFact.fact.
// Never extract these values from prose, cost labels, or model missing-input fields.
export type CalculationFact = {
  concept: "baseline_headcount" | "labor_cost_per_worker" | "ingredient_purchases";
  scope: "tuesday_evening" | "ingredient_waste";
  value: number;
  unit: "persons" | "currency_per_person" | "currency";
  period: string;
  currency: string | null;
};
export type SimulationRequest = {
  evidence: Evidence;
  scenarios: ScenarioResult;
  input_facts: ScenarioInputFact[];
};
export type CalculationInput = {
  name: string;
  value: number;
  unit: string;
  source_ref: string;
};
export type ScenarioCalculation = {
  formula_id: "LABOR_HEADCOUNT_DELTA" | "INGREDIENT_WASTE_RATE_TARGET";
  inputs: CalculationInput[];
  baseline_value: number;
  projected_value: number;
  impact_value: number;
  currency: string;
  period: string;
};
type ResultBase = {
  scenario_title: string;
  target_leak: string;
  controlled_changes: ControlledChange[];
  notes: string[];
};
export type SimulationResult = ResultBase & (
  | { status: "calculable"; calculation: ScenarioCalculation; missing_inputs: [] }
  | { status: "not_calculable_yet"; calculation: null; missing_inputs: string[] }
);
export type SimulationResponse = { results: SimulationResult[] };
