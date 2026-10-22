import { requiredAuthorizationSources, validateAuthorizationRecords } from "../evidence/authorization-records";
import { isEvidence, resolveEvidenceRefs } from "../evidence/provenance";
import { isLeakResult } from "../leaks/leaks";
import type { ControlledChange, ScenarioInputFact, ScenarioRequest, ScenarioResult } from "@/types/scenarios";

export type ScenarioVariableId = "tuesday_evening_headcount" | "ingredient_waste_rate";
export type ScenarioAuthorization = {
  authorization_id: "tuesday_evening_headcount_reduction" | "ingredient_waste_rate_target";
  target_leak: string;
  variable_id: ScenarioVariableId;
  variable_label: string;
  change_type: ControlledChange["change_type"];
  from: number | null;
  value: number;
  unit: string;
  source_refs: string[];
};
export type SemanticRejection = "no_authorized_change" | "unauthorized_variable" | "unauthorized_change"
  | "missing_authorization_refs" | "duplicate_controlled_change" | "authorized_leak_abstained";
export type SemanticValidation = { ok: true } | { ok: false; reason: SemanticRejection };

const labelKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const leakKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const variables: Record<ScenarioVariableId, readonly string[]> = {
  tuesday_evening_headcount: ["tuesday evening headcount", "tuesday_evening_headcount", "tuesday evening 6 pm to 10 pm headcount"],
  ingredient_waste_rate: ["ingredient waste rate", "ingredient_waste_rate"],
};
export function scenarioVariableId(label: string): ScenarioVariableId | undefined {
  return (Object.keys(variables) as ScenarioVariableId[]).find(id => variables[id].includes(labelKey(label)));
}

// AI extracts semantic roles; code validates original source identity, complete
// support, explicit permission and policy bounds. No source prose is parsed here.
export function buildScenarioAuthorizations(input: ScenarioRequest, facts: ScenarioInputFact[]): ScenarioAuthorization[] {
  if (!isEvidence(input.evidence, true) || !isLeakResult(input.leaks, input.evidence)) return [];
  const manifest = input.evidence.provenance!;
  const records = manifest.authorization_records;
  if (!records || !validateAuthorizationRecords(records, manifest.items, input.evidence.currency)) return [];
  const result: ScenarioAuthorization[] = [];
  for (const record of records) {
    if (records.filter(other => other.intervention === record.intervention).length !== 1) continue;
    const required = requiredAuthorizationSources(record);
    if (!required || !required.every(id => {
      const original = manifest.items.find(item => item.id === id);
      return !!original && facts.filter(fact => fact.id === id).length === 1
        && facts.some(fact => fact.id === id && fact.source === original.source && fact.fact === original.text);
    })) continue;
    const matches = input.leaks.leaks.filter(leak => {
      const resolved = resolveEvidenceRefs(input.evidence, leak.evidence_refs);
      return resolved && required.every(id => resolved.includes(id)) && !records.some(other => {
        if (other.intervention === record.intervention) return false;
        const competing = requiredAuthorizationSources(other);
        return competing && competing.every(id => resolved.includes(id));
      });
    });
    if (matches.length !== 1) continue;
    const labor = record.intervention === "headcount_reduction";
    result.push({
      authorization_id: labor ? "tuesday_evening_headcount_reduction" : "ingredient_waste_rate_target",
      target_leak: matches[0].title,
      variable_id: labor ? "tuesday_evening_headcount" : "ingredient_waste_rate",
      variable_label: labor ? "Tuesday evening headcount" : "Ingredient waste rate",
      change_type: labor ? "delta" : "absolute_target", from: labor ? null : 9,
      value: labor ? -1 : 5, unit: labor ? "persons" : "percent", source_refs: required,
    });
  }
  // A single finding claiming multiple intervention identities is ambiguous.
  return result.filter(item => result.filter(other => other.target_leak === item.target_leak).length === 1);
}

// Called only after structural/provenance validation. All comparisons use
// structured authorizations and finite explicit label aliases, never prose or AI.
export function validateScenarioSupport(result: ScenarioResult, authorizations: ScenarioAuthorization[]): SemanticValidation {
  for (const scenario of result.scenarios) {
    const allowed = authorizations.filter(item => leakKey(item.target_leak) === leakKey(scenario.target_leak));
    if (allowed.length === 0) return { ok: false, reason: "no_authorized_change" };
    const used = new Set<ScenarioAuthorization>();
    for (const change of scenario.controlled_changes) {
      const id = scenarioVariableId(change.variable);
      if (!id || !allowed.some(item => item.variable_id === id)) return { ok: false, reason: "unauthorized_variable" };
      const authorization = allowed.find(item => item.variable_id === id && item.change_type === change.change_type
        && item.from === change.from && item.value === change.value && item.unit === change.unit);
      if (!authorization) return { ok: false, reason: "unauthorized_change" };
      if (used.has(authorization)) return { ok: false, reason: "duplicate_controlled_change" };
      if (!authorization.source_refs.every(ref => scenario.available_input_refs.includes(ref))) {
        return { ok: false, reason: "missing_authorization_refs" };
      }
      used.add(authorization);
    }
  }
  for (const leak of result.not_simulation_ready) {
    if (authorizations.some(item => leakKey(item.target_leak) === leakKey(leak.target_leak))) {
      return { ok: false, reason: "authorized_leak_abstained" };
    }
  }
  return { ok: true };
}
