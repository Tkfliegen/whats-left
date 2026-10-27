import type { Evidence } from "@/types/evidence";
import type { LeakResult } from "@/types/leaks";
import { resolveEvidenceRefs } from "../evidence/provenance";
import { normalizeEvidenceCurrency } from "../evidence/currency";
import { requiredAuthorizationSources } from "../evidence/authorization-records";

// Use source identities from already validated Evidence, never recover citations
// from generated prose. These groups guide generation; omissions reject output.
export function citationRequirements(evidence: Evidence) {
  return (evidence.provenance!.authorization_records ?? []).flatMap(record => {
    const source_refs = requiredAuthorizationSources(record);
    if (!source_refs) return [];
    const fact_ids = source_refs.map(ref => evidence.provenance!.citable_facts
      .find(fact => fact.source_refs.length === 1 && fact.source_refs[0] === ref)?.id);
    if (fact_ids.some(id => !id)) throw new Error("Unresolvable Leak citation requirement.");
    return [{ intervention: record.intervention, source_refs, fact_ids: fact_ids as string[] }];
  });
}

const numberPattern = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const normalize = (value: string) => value.replace(/,/g, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
const numbers = (text: string) => (text.match(numberPattern) ?? []).map(normalize);
// A reported scalar is not permission to invent a percentage/percentage-point
// claim with the same digits. Unit-bearing claims need that reported unit too.
const rates = (text: string) => [...text.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|percent(?:age)?(?:\s+points?)?)/gi)]
  .map(match => `${normalize(match[1])}:${/points?/i.test(match[2]) ? "percentage_points" : "percent"}`);

// Monetary support is an amount/currency pair, never a scalar pooled with
// unrelated units. Currency aliases use the existing Evidence policy only.
function monetaryExpressions(text: string, originalSource: string) {
  const codes = ["USD", "TWD", "AED", "EUR", "GBP"].map(code => [...code]
    .map(letter => `[${letter}${letter.toLowerCase()}]`).join("")).join("|");
  const currency = `(?:${codes}|US\\$|NT\\$|[A-Z]{3}|[$€£¥₹]|د\\.إ)`;
  const amount = "\\d+(?:,\\d{3})*(?:\\.\\d+)?";
  const prefix = new RegExp(`(?<![\\p{L}\\p{N}_])([+−-]?)[ \\t]*(${currency})[ \\t]*([+−-]?)[ \\t]*(\\(?)(${amount})(\\)?)(?![\\p{L}\\p{N}_,]|\\.\\d)`, "gu");
  const suffix = new RegExp(`(?<![\\p{L}\\p{N}_.,])([+−-]?)[ \\t]*(\\(?)(${amount})(\\)?)[ \\t]*(${currency})(?![\\p{L}\\p{N}_])`, "gu");
  const claim = (notation: string, value: string, sign: string, open: string, close: string, mixedUnit: boolean) => {
    const normalized = normalizeEvidenceCurrency(notation, originalSource);
    const unit = normalized.ok && normalized.currency ? normalized.currency : notation;
    const signed = `${/[-−]/.test(sign) || open ? "-" : ""}${normalize(value)}`;
    // Unpaired parentheses or conflicting sign forms cannot supply support.
    return { amount: signed, key: mixedUnit || (open && !close) || sign.length > 1
      ? null : `${unit}:${signed}` };
  };
  return [
    ...[...text.matchAll(prefix)].map(m => claim(m[2], m[5], m[1] + m[3], m[4], m[6],
      text[m.index! + m[0].length] === "%")),
    ...[...text.matchAll(suffix)].map(m => claim(m[5], m[3], m[1],
      m[2] && !m[4] && text[m.index! + m[0].length] === ")" ? "" : m[2], m[4], text[m.index! + m[0].length] === "%")),
  ];
}

// Validation-only vocabulary for clear multipliers, not general English numbers.
const ratioWords: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10", twice: "2", double: "2", triple: "3", half: "0.5" };
const quantity = "one|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\.\\d+)?";
const qualifier = "(?:(over|under|more\\s+than|less\\s+than|at\\s+least|at\\s+most|about|approximately|nearly|almost|exactly|up\\s+to)\\s+)?";
// A ratio must modify a measure/comparison, not an occurrence (twice monthly),
// a product name (double espresso), or ordinary prose (double-check, half-day).
const ratioAnchor = "(?:of\\s+)?(?:(?:the|a|an|our|their|its)\\s+)?(?:revenue|sales|costs?|expenses?|amount|profit|income|fees|rate|volume|output|price|wages|staffing|headcount|baseline|target|increase|decrease|growth|reduction|higher|lower|greater|more|less|as\\s+(?:much|many))";
function quantitativeRatios(text: string) {
  const clean = (value: string) => value.toLowerCase().replace(/[-\s]+/g, " ").trim();
  const patterns = [
    { kind: "times", pattern: new RegExp(`\\b${qualifier}(${quantity})[\\s-]+times[\\s-]+(${ratioAnchor})\\b`, "gi") },
    { kind: "fold", pattern: new RegExp(`\\b${qualifier}(${quantity})[\\s-]*fold[\\s-]+(${ratioAnchor})\\b`, "gi") },
    { kind: "times", pattern: new RegExp(`\\b${qualifier}(twice|double|triple|half)\\s+(${ratioAnchor})\\b`, "gi") },
  ];
  return patterns.flatMap(({ kind, pattern }) => [...text.matchAll(pattern)].map(match => {
    const word = match[2].toLowerCase();
    const value = ratioWords[word] ?? normalize(word);
    const anchor = clean(match[3]).replace(/^(?:of )?(?:(?:the|a|an|our|their|its) )?/, "");
    const negation = /\b(not|never)\s+$/i.exec(text.slice(0, match.index))?.[1]?.toLowerCase() ?? "";
    return { index: match.index!, wordForm: Object.hasOwn(ratioWords, word), value,
      key: `${negation}:${clean(match[1] ?? "")}:${value}:${kind}:${anchor}` };
  })).sort((a, b) => a.index - b.index);
}

export type LeakOutputValidation = { ok: true } | {
  ok: false;
  reason: "unreported_number" | "unreported_numeric_unit" | "incomplete_citation_support" | "invalid_evidence_refs" | "invalid_intervention_ref";
  field: string;
  numbers?: string[];
  missing_fact_ids?: string[];
};

export type LeakCitationDiagnostic = {
  reason: "incomplete_citation_support";
  finding_index: number;
  intervention_ref: LeakResult["leaks"][number]["intervention_ref"];
  trigger: "intervention_binding" | "intersection";
  returned_fact_ids: string[];
  required_fact_ids: string[];
  missing_fact_ids: string[];
};

export type LeakNumericDiagnostic = {
  reason: "unreported_number";
  rejection_branch: "scalar_not_in_selected_support" | "unsupported_derived_numeric_claim";
  normalized_number: string;
  field_path: string;
  number_in_global_support: boolean;
  number_in_selected_support: boolean | null;
  selected_citation_count: number;
  matching_support_count: number;
  global_matching_support_count: number;
  numeric_expression_type: "scalar" | "derived_ratio";
  support_scope: "finding_citations" | "global_catalog";
};

// Pass A: IDs and complete bound support are validated for ALL findings before
// any generated prose is inspected. An absent legacy binding means unbound.
export function validateLeakReferences(result: LeakResult, evidence: Evidence,
  onCitationReject?: (diagnostic: LeakCitationDiagnostic) => void): LeakOutputValidation {
  const catalog = new Map(evidence.provenance!.citable_facts.map(fact => [fact.id, fact]));
  const requirements = citationRequirements(evidence);
  for (const [index, leak] of result.leaks.entries()) {
    const resolvedRefs = resolveEvidenceRefs(evidence, leak.evidence_refs);
    if (!resolvedRefs) return { ok: false, reason: "invalid_evidence_refs", field: `leaks[${index}].evidence_refs` };
    const binding = leak.intervention_ref;
    if (binding != null && requirements.filter(group => group.intervention === binding).length !== 1) {
      return { ok: false, reason: "invalid_intervention_ref", field: `leaks[${index}].intervention_ref` };
    }
    const resolved = new Set(resolvedRefs);
    for (const group of requirements) {
      const applicable = binding === group.intervention || group.source_refs.some(ref => resolved.has(ref));
      if (applicable && !group.source_refs.every(ref => resolved.has(ref))) {
        const missing = group.fact_ids.filter(id => !catalog.get(id)!.source_refs.every(ref => resolved.has(ref)));
        // Never copy prose or arbitrary malformed strings into diagnostics.
        const safeIds = (ids: string[]) => ids.map(id => /^fact_[a-f0-9]{32}_\d+$/.test(id) ? id : "[invalid_fact_id]");
        onCitationReject?.({
          reason: "incomplete_citation_support",
          finding_index: index,
          intervention_ref: binding ?? null,
          trigger: binding === group.intervention ? "intervention_binding" : "intersection",
          returned_fact_ids: safeIds(leak.evidence_refs),
          required_fact_ids: safeIds(group.fact_ids),
          missing_fact_ids: safeIds(missing),
        });
        return { ok: false, reason: "incomplete_citation_support", field: `leaks[${index}].evidence_refs`,
          missing_fact_ids: missing };
      }
    }
  }
  return { ok: true };
}

// Called after schema validation. Existing digit/unit rules run unchanged;
// word-form multipliers additionally require an explicit cited ratio claim.
export function validateLeakOutput(result: LeakResult, evidence: Evidence,
  onCitationReject?: (diagnostic: LeakCitationDiagnostic) => void,
  onNumericReject?: (diagnostic: LeakNumericDiagnostic) => void): LeakOutputValidation {
  const references = validateLeakReferences(result, evidence, onCitationReject);
  if (!references.ok) return references;
  const catalog = new Map(evidence.provenance!.citable_facts.map(fact => [fact.id, fact]));
  // Pass B: existing prose checks, after every finding passes reference checks.
  const check = (text: string, field: string, source: string,
    selected?: Array<{ text: string }>): LeakOutputValidation => {
    const diagnose = (value: string, branch: LeakNumericDiagnostic["rejection_branch"]) => {
      if (!onNumericReject) return;
      try {
        const matching = (facts: Array<{ text: string }>) => facts.filter(fact => numbers(fact.text).includes(value)).length;
        const globalCount = matching([...catalog.values()]);
        const selectedCount = selected ? matching(selected) : 0;
        onNumericReject({ reason: "unreported_number", rejection_branch: branch, normalized_number: value, field_path: field,
          number_in_global_support: globalCount > 0, number_in_selected_support: selected ? selectedCount > 0 : null,
          selected_citation_count: selected?.length ?? 0, matching_support_count: selectedCount,
          global_matching_support_count: globalCount,
          numeric_expression_type: branch === "unsupported_derived_numeric_claim" || quantitativeRatios(text).some(claim => claim.value === value) ? "derived_ratio" : "scalar",
          support_scope: selected ? "finding_citations" : "global_catalog" });
      } catch { /* Optional diagnostics cannot change acceptance or rejection. */ }
    };
    const reported = new Set(numbers(source));
    const missing = [...new Set(numbers(JSON.stringify(text)).filter(value => !reported.has(value)))];
    if (missing.length) {
      diagnose(missing[0], "scalar_not_in_selected_support");
      return { ok: false, reason: "unreported_number", field, numbers: missing };
    }
    const reportedRates = new Set(rates(source));
    const missingRates = rates(text).filter(value => !reportedRates.has(value));
    if (missingRates.length) return { ok: false, reason: "unreported_numeric_unit", field,
      numbers: [...new Set(missingRates.map(value => value.split(":")[0]))] };
    const originalSource = evidence.provenance!.source_input;
    const eligible = selected ?? [...catalog.values()];
    const reportedMoney = new Set(eligible.flatMap(fact => monetaryExpressions(fact.text, originalSource))
      .filter(claim => claim.key !== null).map(claim => claim.key));
    const missingMoney = monetaryExpressions(text, originalSource)
      .filter(claim => claim.key === null || !reportedMoney.has(claim.key));
    if (missingMoney.length) return { ok: false, reason: "unreported_numeric_unit", field,
      numbers: [...new Set(missingMoney.map(claim => claim.amount))] };
    const reportedRatios = new Set(quantitativeRatios(source).map(claim => claim.key));
    const unsupported = quantitativeRatios(text).filter(claim => claim.wordForm && !reportedRatios.has(claim.key));
    if (unsupported.length) {
      diagnose(unsupported[0].value, "unsupported_derived_numeric_claim");
      return { ok: false, reason: "unreported_number", field,
        numbers: [...new Set(unsupported.map(claim => claim.value))] };
    }
    return { ok: true };
  };
  for (const [index, leak] of result.leaks.entries()) {
    const cited = leak.evidence_refs.map(id => catalog.get(id)!);
    const source = cited.map(fact => fact.text).join("\n");
    for (const [field, text] of [
      [`leaks[${index}].title`, leak.title],
      ...leak.evidence.map((text, citation) => [`leaks[${index}].evidence[${citation}]`, text]),
      [`leaks[${index}].interpretation`, leak.interpretation],
    ]) {
      const validation = check(text, field, source, cited);
      if (!validation.ok) return validation;
    }
  }
  // Insufficient-evidence entries have no per-entry refs in the existing
  // contract. Their numbers must still come from the trusted citable catalog.
  const source = evidence.provenance!.citable_facts.map(fact => fact.text).join("\n");
  for (const [index, item] of result.insufficient_evidence.entries()) {
    for (const field of ["topic", "reason"] as const) {
      const validation = check(item[field], `insufficient_evidence[${index}].${field}`, source);
      if (!validation.ok) return validation;
    }
  }
  return { ok: true };
}
