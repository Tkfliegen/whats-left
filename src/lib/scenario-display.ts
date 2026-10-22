import type { ControlledChange, ScenarioResponse, ScenarioResult } from "@/types/scenarios";
import type { SimulationResponse, SimulationResult } from "@/types/scenario-calculator";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function isChange(value: unknown): value is ControlledChange {
  return record(value) && typeof value.variable === "string" && typeof value.unit === "string"
    && finite(value.value) && (finite(value.from) || (value.from === null && value.change_type === "delta"))
    && ["delta", "absolute_target"].includes(String(value.change_type));
}
export function isScenarioResponse(value: unknown): value is ScenarioResponse {
  if (!record(value) || !record(value.scenarios) || !Array.isArray(value.input_facts)) return false;
  const facts = value.input_facts;
  if (!facts.every(fact => record(fact) && typeof fact.id === "string" && typeof fact.source === "string" && typeof fact.fact === "string")) return false;
  const result = value.scenarios;
  return Array.isArray(result.scenarios) && result.scenarios.every(item => record(item)
    && typeof item.title === "string" && typeof item.target_leak === "string"
    && ["low", "medium", "high"].includes(String(item.confidence))
    && Array.isArray(item.controlled_changes) && item.controlled_changes.length > 0 && item.controlled_changes.every(isChange)
    && strings(item.available_input_refs) && strings(item.missing_calculation_inputs))
    && Array.isArray(result.not_simulation_ready) && result.not_simulation_ready.every(item => record(item)
      && typeof item.target_leak === "string" && typeof item.reason === "string" && strings(item.missing_decision_input_categories));
}

// Calculator copies both fields unchanged. Require one exact match, never fuzzy matching.
export function simulationFor(scenario: ScenarioResult["scenarios"][number], result: SimulationResponse | null): SimulationResult | undefined {
  const matches = result?.results.filter(item => item.scenario_title === scenario.title && item.target_leak === scenario.target_leak);
  return matches?.length === 1 ? matches[0] : undefined;
}
export function isSimulationResponse(value: unknown, scenarios: ScenarioResult): value is SimulationResponse {
  if (!record(value) || !Array.isArray(value.results) || value.results.length !== scenarios.scenarios.length) return false;
  for (const item of value.results) {
    if (!record(item) || typeof item.scenario_title !== "string" || typeof item.target_leak !== "string"
      || !Array.isArray(item.controlled_changes) || !item.controlled_changes.every(isChange)
      || !strings(item.notes) || !strings(item.missing_inputs)) return false;
    if (item.status === "not_calculable_yet") {
      if (item.calculation !== null || item.missing_inputs.length === 0) return false;
    } else if (item.status === "calculable") {
      const calc = item.calculation;
      if (!record(calc) || typeof calc.formula_id !== "string" || typeof calc.currency !== "string" || typeof calc.period !== "string"
        || !finite(calc.baseline_value) || !finite(calc.projected_value) || !finite(calc.impact_value)
        || !Array.isArray(calc.inputs) || !calc.inputs.every(input => record(input) && typeof input.name === "string"
          && finite(input.value) && typeof input.unit === "string" && typeof input.source_ref === "string")) return false;
    } else return false;
  }
  const response = value as unknown as SimulationResponse;
  return scenarios.scenarios.every(scenario => {
    const match = simulationFor(scenario, response);
    return !!match && JSON.stringify(match.controlled_changes) === JSON.stringify(scenario.controlled_changes);
  });
}
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 }).format(value);
export function controlledChangeLabel(change: ControlledChange): string {
  if (change.change_type === "delta") {
    const amount = number(change.value).replace("-", "−");
    const unit = change.unit === "persons" && (change.value === -1 || change.value === 1) ? "person" : change.unit;
    return `${change.value > 0 ? "+" : ""}${amount} ${unit}`;
  }
  const suffix = change.unit === "percent" ? "%" : ` ${change.unit}`;
  return `${number(change.from!)}${suffix} → ${number(change.value)}${suffix}`;
}
export function scenarioMoney(value: number, currency: string): string {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${number(value)}`; }
}
