import type { Evidence, EvidenceSource, LaborCalculationSupport, CalculationAnchor, TrustedLaborCalculationFact } from "@/types/evidence";
import { matchesSchema, type Schema } from "./evidence";

export function createCalculationSupportSchema(sourceIds?: string[]): Schema {
  const anchor: Schema = { type: "object", properties: {
    source_ref: { type: "string", ...(sourceIds ? { enum: sourceIds } : {}) }, quote: { type: "string" },
  }, required: ["source_ref", "quote"], additionalProperties: false };
  return { type: "array", items: { type: "object", properties: {
    concept: { type: "string", enum: ["baseline_headcount", "labor_cost_per_worker"] },
    scope: { type: "string", const: "tuesday_evening" }, period: { type: "string" },
    support: { type: "object", properties: { value: anchor, unit: anchor, scope: anchor, period: anchor,
      currency: { anyOf: [anchor, { type: "null" }], type: ["object", "null"] } },
    required: ["value", "unit", "scope", "period", "currency"], additionalProperties: false },
  }, required: ["concept", "scope", "period", "support"], additionalProperties: false } };
}

const scalar = /^-?\d+(?:,\d{3})*(?:\.\d+)?$/;
const tokens = (text: string): string[] => text.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
const monthlyPeriod = /^(?:(?:last|this|current|previous) month|month|monthly|(?:january|february|march|april|may|june|july|august|september|october|november|december)(?: \d{4})?|\d{4}-\d{2})$/;
// Generic monthly frequency aliases only. Relative/dated periods retain their
// identity: "monthly" never establishes "last month" or a particular month.
export function periodKey(text: string): string | null {
  const key = text.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (/^(?:month|monthly|per month|each month|monthly reporting period|affected monthly(?: reporting)? period)$/.test(key)) return "month";
  if (monthlyPeriod.test(key) || /^(?:(?:(?:last|this|current|previous) )?(?:day|week|quarter|year)|daily|weekly|quarterly|yearly|annual|annually|\d{4}-\d{2}-\d{2})$/.test(key)) return key;
  return null;
}
const weekdayScope = /\bTuesday evenings?\b/i;
const otherDay = /\b(Monday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const perWorker = /\b(?:per[ -]+(?:worker|person|staff member)|each (?:worker|person|staff member))\b/i;

// Negative-only conflict guard for the two bounded claim grammars. This never
// produces a fact or supplies an anchor the extractor omitted.
function conflictingClaims(concept: LaborCalculationSupport["concept"], statements: string[], accepted: number) {
  const numeric = "(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?)";
  const patterns = concept === "baseline_headcount"
    ? [new RegExp(`\\b(?:baseline|current)\\s+(?:Tuesday evenings?\\s+)?headcount(?:\\s+(?:for|on) Tuesday evenings?)?\\s*(?:is|was|=|:)\\s*${numeric}\\s+(?:staff members?|staff|people|persons?|employees?)\\b`, "gi")]
    : [new RegExp(`${numeric}\\s+per[ -]+(?:worker|person|staff member)\\b`, "gi"),
      new RegExp(`\\b(?:labor|staffing) cost per[ -]+(?:worker|person|staff member)(?: for Tuesday evenings?)?\\s*(?:is|was|=|:)\\s*(?:[A-Z]{3}\\s+)?${numeric}`, "gi")];
  const values = statements.filter(text => weekdayScope.test(text) && (concept === "baseline_headcount"
    ? /\b(?:baseline|current)\b/i.test(text) && /\bheadcount\b/i.test(text)
    : /\b(?:labor|staffing|staff)\b/i.test(text) && perWorker.test(text)))
    .flatMap(text => patterns.flatMap(pattern => [...text.matchAll(pattern)].map(match => Number(match[1].replace(/,/g, "")))));
  return values.some(value => value !== accepted);
}

export type CalculationFactDiagnostic = {
  stage: "evidence_grounding";
  concept: LaborCalculationSupport["concept"];
  candidate_count: number;
  accepted: boolean;
  rejection_reason: string | null;
  candidates: { scope_present: boolean; scope_recognized: boolean; period_present: boolean;
    unit_anchor_present: boolean; currency_anchor_present: boolean; anchor_count: number }[];
};

// Explicit allowlist projection: never retain quotes, IDs, scalars or arbitrary model fields.
export function logCalculationDiagnostic(diagnostic: CalculationFactDiagnostic) {
  if (process.env.NODE_ENV !== "development") return;
  try { console.warn("[What's Left?] Calculation fact grounding", JSON.stringify(diagnostic)); } catch { /* diagnostics only */ }
}

export function logCalculationHandoff(stage: "scenario_input" | "simulate_input", facts: { source: string }[]) {
  if (process.env.NODE_ENV !== "development") return;
  try {
    for (const concept of ["baseline_headcount", "labor_cost_per_worker"] as const) {
      const count = facts.filter(fact => fact.source === `calculation_inputs.${concept}`).length;
      console.warn("[What's Left?] Calculation fact handoff", JSON.stringify({ stage, concept,
        calculation_input_emitted: count > 0, record_count: count }));
    }
  } catch { /* diagnostics cannot affect analysis */ }
}

// Only these two extraction concepts are supported. Quotes are original-source
// anchors, not paraphrases. No prose-to-number recovery, arithmetic or repair.
export function groundCalculationFacts(value: unknown, sources: EvidenceSource[], evidence: Pick<Evidence, "period" | "currency">, diagnose?: (diagnostic: CalculationFactDiagnostic) => void): TrustedLaborCalculationFact[] {
  const input = Array.isArray(value) ? value : [];
  const catalog = new Map(sources.filter(s => /^source_input\[\d+\]$/.test(s.source)).map(s => [s.id, s.text]));
  const literal = (anchor: CalculationAnchor) => {
    const source = catalog.get(anchor.source_ref);
    if (!source || !anchor.quote.trim()) return false;
    let position = source.indexOf(anchor.quote);
    while (position >= 0) {
      const left = source[position - 1] ?? "", right = source[position + anchor.quote.length] ?? "";
      if (!/[\p{L}\p{N}]/u.test(left) && !/[\p{L}\p{N}]/u.test(right)) return true;
      position = source.indexOf(anchor.quote, position + 1);
    }
    return false;
  };
  const result: TrustedLaborCalculationFact[] = [];
  for (const concept of ["baseline_headcount", "labor_cost_per_worker"] as const) {
    // Even an invalid duplicate poisons this concept; never select a winner.
    const candidates = input.filter(v => v && typeof v === "object" && v.concept === concept);
    const report = (rejection_reason: string | null) => {
      if (!diagnose) return;
      try { diagnose({ stage: "evidence_grounding", concept, candidate_count: candidates.length,
        accepted: rejection_reason === null, rejection_reason,
        candidates: candidates.map(candidate => {
          const support = candidate.support && typeof candidate.support === "object" ? candidate.support : {};
          const present = (anchor: unknown) => !!anchor && typeof anchor === "object"
            && "quote" in anchor && typeof anchor.quote === "string" && !!anchor.quote.trim();
          return { scope_present: typeof candidate.scope === "string" && !!candidate.scope,
            scope_recognized: candidate.scope === "tuesday_evening",
            period_present: typeof candidate.period === "string" && !!candidate.period.trim(),
            unit_anchor_present: present(support.unit), currency_anchor_present: present(support.currency),
            anchor_count: [support.value, support.unit, support.scope, support.period, support.currency].filter(present).length };
        }) }); } catch { /* optional diagnostics must not affect grounding */ }
    };
    if (candidates.length !== 1 || !matchesSchema(candidates, createCalculationSupportSchema())) {
      report(candidates.length === 0 ? "missing_candidate" : candidates.length > 1 ? "duplicate_candidates" : "schema_invalid"); continue;
    }
    const record = candidates[0] as LaborCalculationSupport, s = record.support;
    if (!evidence.period?.trim() || !periodKey(record.period) || periodKey(record.period) !== periodKey(evidence.period)
      || ![s.value, s.unit, s.scope, s.period, ...(s.currency ? [s.currency] : [])].every(literal)) {
      const anchor = [s.value, s.unit, s.scope, s.period, ...(s.currency ? [s.currency] : [])].find(a => !literal(a));
      report(!evidence.period?.trim() ? "missing_evidence_period" : !periodKey(record.period) || periodKey(record.period) !== periodKey(evidence.period) ? "period_mismatch"
        : anchor && !catalog.get(anchor.source_ref) ? "unknown_source_ref"
        : anchor && !anchor.quote.trim() ? "empty_anchor"
        : anchor && !catalog.get(anchor.source_ref)!.includes(anchor.quote) ? "anchor_not_literal" : "quote_boundary_mismatch"); continue;
    }
    // Value, quantity-bearing unit, scope and currency must describe the same
    // original statement. A nearby unrelated scope cannot license a quantity.
    if (s.unit.source_ref !== s.value.source_ref || s.scope.source_ref !== s.value.source_ref
      || !s.scope.quote.includes(s.unit.quote) || !s.unit.quote.includes(s.value.quote)
      || !weekdayScope.test(s.scope.quote) || otherDay.test(s.scope.quote)) {
      report(s.unit.source_ref !== s.value.source_ref ? "value_unit_source_mismatch"
        : s.scope.source_ref !== s.value.source_ref ? "scope_source_mismatch"
        : !s.scope.quote.includes(s.unit.quote) ? "scope_missing_unit_anchor"
        : !s.unit.quote.includes(s.value.quote) ? "unit_missing_value_anchor" : "wrong_scope"); continue;
    }
    // A literal number in a hypothetical/denied claim is not a reported input.
    if (/\b(?:not|never|hypothetical|assume|assumed|assuming|estimate|estimated|forecast|target|proposed|would|could|might|if)\b/i
      .test(catalog.get(s.value.source_ref)!)) { report("hypothetical_or_unsupported"); continue; }
    if (!scalar.test(s.value.quote)) { report("value_not_single_numeric_literal"); continue; }
    const number = Number(s.value.quote.replace(/,/g, ""));
    // The value anchor must be a whole scalar token, not 4 selected from 4.5.
    if (!tokens(catalog.get(s.value.source_ref)!).includes(s.value.quote)
      || !Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER / 100) { report(!tokens(catalog.get(s.value.source_ref)!).includes(s.value.quote) ? "scalar_token_not_supported" : "value_out_of_range"); continue; }
    const unitTokens = tokens(s.unit.quote);
    if (unitTokens.length !== 1 || unitTokens[0] !== s.value.quote) { report("unit_quantity_mismatch"); continue; }
    // An exact reporting-period anchor may be separate only when this quantity
    // explicitly refers to that affected reporting period.
    if (!periodKey(s.period.quote) || periodKey(s.period.quote) !== periodKey(record.period)
      || (s.period.source_ref !== s.value.source_ref
        && !/\baffected (?:monthly(?: reporting)?|reporting) period\b/i.test(s.scope.quote))) { report(!periodKey(s.period.quote) || periodKey(s.period.quote) !== periodKey(record.period) ? "period_anchor_mismatch" : "period_relationship_missing"); continue; }
    if (/\baffected monthly(?: reporting)? period\b/i.test(s.scope.quote) && !monthlyPeriod.test(periodKey(record.period)!)) { report("monthly_period_mismatch"); continue; }
    if (conflictingClaims(concept, [...catalog.values()], number)) { report("conflicting_source_values"); continue; }
    if (concept === "baseline_headcount") {
      if (!Number.isSafeInteger(number) || s.currency !== null
        || !/\b(?:baseline|current)\b/i.test(s.scope.quote) || !/\bheadcount\b/i.test(s.scope.quote)
        || !/\b(?:staff members?|staff|people|persons?|employees?)\b/i.test(s.unit.quote)) {
        report(!Number.isSafeInteger(number) ? "headcount_not_integer" : s.currency !== null ? "unexpected_headcount_currency"
          : !/\b(?:baseline|current)\b/i.test(s.scope.quote) || !/\bheadcount\b/i.test(s.scope.quote) ? "headcount_concept_missing" : "headcount_unit_missing"); continue;
      }
      result.push({ ...record, period: evidence.period, value: number, unit: "persons", currency: null });
    } else {
      let unit = s.unit;
      // Bind only within the accepted literal scope, after all shared grounding.
      // Keep the original currency-bearing quantity anchor as a required substring.
      if (!perWorker.test(unit.quote) && s.currency
        && s.currency.source_ref === s.value.source_ref && s.currency.quote === evidence.currency
        && /^[A-Z]{3}$/.test(s.currency.quote) && unit.quote.includes(s.currency.quote)) {
        const phrases = [...s.scope.quote.matchAll(/\b(?:per (?:worker|person|staff member)|each (?:worker|person|staff member))\b/gi)];
        const spans: string[] = [];
        for (let position = s.scope.quote.indexOf(unit.quote); position >= 0;
          position = s.scope.quote.indexOf(unit.quote, position + 1)) {
          for (const phrase of phrases) {
            const start = Math.min(position, phrase.index!);
            const end = Math.max(position + unit.quote.length, phrase.index! + phrase[0].length);
            const quote = s.scope.quote.slice(start, end);
            const quantities = tokens(quote);
            if (quantities.length === 1 && quantities[0] === s.value.quote
              && literal({ source_ref: unit.source_ref, quote })) spans.push(quote);
          }
        }
        // Shortest valid contiguous span; stable source order breaks ties.
        spans.sort((a, b) => a.length - b.length);
        if (spans.length) unit = { ...unit, quote: spans[0] };
      }
      if (!s.currency || s.currency.source_ref !== s.value.source_ref || s.currency.quote !== evidence.currency
        || !/^[A-Z]{3}$/.test(s.currency.quote) || !unit.quote.includes(s.currency.quote)
        || !perWorker.test(unit.quote) || !/\b(?:labor|staffing|staff)\b/i.test(s.scope.quote)) {
        report(!s.currency ? "currency_missing" : s.currency.source_ref !== s.value.source_ref ? "currency_source_mismatch"
          : s.currency.quote !== evidence.currency ? "currency_mismatch" : !/^[A-Z]{3}$/.test(s.currency.quote) ? "currency_invalid"
          : !unit.quote.includes(s.currency.quote) ? "currency_not_in_unit_anchor" : !perWorker.test(unit.quote) ? "per_worker_unit_missing" : "labor_concept_missing"); continue;
      }
      result.push({ ...record, period: evidence.period, support: { ...s, unit }, value: number, unit: "currency_per_person", currency: s.currency.quote });
    }
    report(null);
  }
  return result;
}

export const calculationInput = ({ concept, scope, value, unit, period, currency }: TrustedLaborCalculationFact) =>
  ({ concept, scope, value, unit, period, currency });

export function validateCalculationFacts(value: unknown, sources: EvidenceSource[], evidence: Pick<Evidence, "period" | "currency">): value is TrustedLaborCalculationFact[] {
  if (!Array.isArray(value)) return false;
  const supports = value.map(fact => {
    if (!fact || typeof fact !== "object") return fact;
    const { value: _value, unit: _unit, currency: _currency, ...support } = fact;
    void _value; void _unit; void _currency;
    return support;
  });
  const grounded = groundCalculationFacts(supports, sources, evidence);
  return grounded.length === value.length && grounded.every(fact => value.some(actual =>
    matchesSchema([supports[value.indexOf(actual)]], createCalculationSupportSchema())
    && Object.keys(actual).length === 7 && actual.concept === fact.concept && actual.scope === fact.scope
    && actual.period === fact.period && actual.value === fact.value && actual.unit === fact.unit && actual.currency === fact.currency
    && JSON.stringify(actual.support) === JSON.stringify(fact.support)));
}
