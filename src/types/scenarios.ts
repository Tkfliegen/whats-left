import type { Evidence } from "./evidence";
import type { LeakResult } from "./leaks";

export type ScenarioRequest = {
  evidence: Evidence;
  leaks: LeakResult;
  operational_context: string[];
};
export type ScenarioInputFact = { id: string; source: string; fact: string };
export type ControlledChange = {
  variable: string;
  change_type: "delta" | "absolute_target";
  from: number | null;
  value: number;
  unit: string;
};
export type ScenarioResult = {
  scenarios: Array<{
    title: string;
    target_leak: string;
    controlled_changes: ControlledChange[];
    available_input_refs: string[];
    missing_calculation_inputs: string[];
    confidence: "low" | "medium" | "high";
  }>;
  not_simulation_ready: Array<{
    target_leak: string;
    reason: string;
    missing_decision_input_categories: string[];
  }>;
};
export type ScenarioResponse = {
  scenarios: ScenarioResult;
  input_facts: ScenarioInputFact[];
};
