import type { AuthorizationRecord, Evidence } from "@/types/evidence";
import { resolveEvidenceRefs } from "../evidence/provenance";
import { validateAuthorizationRecords } from "../evidence/authorization-records";
import { normalizeEvidenceCurrency } from "../evidence/currency";
import { verifyLaborShareComparison } from "./labor-share-comparisons";

// A bounded parser for the scoped monetary comparison, not a general prose
// reasoner. Unknown operands, negations and ambiguous support fail closed.
const relation = /\b(?:exceeds?|exceeded|exceeding|greater than|higher than|more than|less than|lower than|below|above|equal to|equivalent to|equals?|equalled|equaled)\b/gi;
const measures = /\b(?:(?:staffing|labou?r)\s+costs?|costs?|sales(?:\s+revenue)?|revenue)\b/gi;
const role = (label: string) => /sales|revenue/i.test(label) ? "sales" : "staffing_cost";
const codes = ["USD", "TWD", "AED", "EUR", "GBP"].map(code => [...code].map(letter => `[${letter}${letter.toLowerCase()}]`).join("")).join("|");
const currencyNotation = new RegExp(`\\b(?:${codes}|[A-Z]{3})\\b|US\\$|NT\\$|[$€£¥₹]`, "g");
const incompatibleDenominator = /\b(?:per|each)\s+(?!month\b|affected monthly period\b|affected reporting period\b)\S+/i;
const operandWords = /\b(?:the|a|an|our|their|its|reported|actual|current|total|Tuesday|evenings?|monthly|month|per|last|affected|reporting|period|same|is|are|was|were|has|been|had|in|for|of|during|on|at|this|those|these|only|labou?r|inefficiency|with|staff|workers?|members?|people|persons?)\b/gi;

export function verifyLaborComparisons(text: string, evidence: Evidence, refs: string[], laborContext: boolean,
  moneyKeys: (source: string) => Array<string | null>): boolean {
  const comparisons = [...text.matchAll(relation)];
  if (!comparisons.length) return true;
  const manifest = evidence.provenance!;
  const resolved = resolveEvidenceRefs(evidence, refs);
  const records = manifest.authorization_records ?? [];
  // This boundary owns staffing-cost/sales claims only. Source identity also
  // establishes this context, so changing a model category cannot bypass it.
  // Other domains retain their existing numeric/unit/ratio rules.
  const boundLaborContext = /\bcosts?\b/i.test(text) && /\b(?:sales|revenue)\b/i.test(text)
    && records.some(record => record.intervention === "headcount_reduction"
      && record.supporting_facts.some(fact => fact.source_refs.some(id => resolved?.includes(id))));
  if (!resolved || !validateAuthorizationRecords(records, manifest.items, evidence.currency)) return false;
  for (const comparison of comparisons) {
    const before = text.slice(0, comparison.index).split(/[!?;\n]|\.(?!\d)/).at(-1)!;
    const after = text.slice(comparison.index! + comparison[0].length)
      .split(/[!?;\n]|\.(?!\d)|,(?!\d)|\b(?:despite|although|while|whereas|because|but)\b/i)[0];
    const share = verifyLaborShareComparison(before, after, comparison[0], evidence, refs, laborContext, moneyKeys);
    if (share !== null) { if (!share) return false; continue; }
    if (!laborContext && !boundLaborContext && !/\b(?:staffing|labou?r)\s+costs?\b/i.test(text)) continue;
    // Explicit per-person equivalences are a different measure, governed by
    // existing literal numeric/unit grounding, not this cost-versus-sales pair.
    if (/^equal/i.test(comparison[0]) && /\bper (?:staff member|worker|person)\b/i.test(after)
      && !/\b(?:sales|revenue)\b/i.test(after)) continue;
    const leftMeasures = [...before.matchAll(measures)], rightMeasures = [...after.matchAll(measures)];
    const left = leftMeasures[0], right = rightMeasures[0];
    if (leftMeasures.length !== 1 || rightMeasures.length !== 1 || !left || !right
      || role(left[0]) === role(right[0]) || /\b(?:not|never|no)\b/i.test(before)) return false;
    // Only finite operand/context wording is understood. Do not silently bind
    // an unknown qualifier (for example a different business scope) to Tuesday.
    if ([before, after].some(operand => /\p{L}/u.test(operand.replace(measures, "")
      .replace(currencyNotation, "").replace(operandWords, "")))) return false;
    if (/\b(?:and|or|plus|combined|including|excluding|projected|forecast|hypothetical)\b/i.test(before)
      || incompatibleDenominator.test(before + " " + after)
      || /\b(?:weekly|daily|yearly|annually|quarterly)\b/i.test(before + " " + after)) return false;
    const operandText = before + " " + after.slice(0, right.index! + right[0].length);
    if (/\b(?:Monday|Wednesday|Thursday|Friday|Saturday|Sunday|weekly|daily|annually|yearly|week|day|year|whole.business|total business|delivery|per order|per worker|per person|per staff member)\b/i.test(operandText)) return false;
    const candidates: Array<AuthorizationRecord["supporting_facts"]> = records.filter(record => record.intervention === "headcount_reduction"
      && record.scope === "tuesday_evening_6pm_10pm"
      && record.supporting_facts.length === 2
      && record.supporting_facts.every(fact => fact.unit === "currency" && fact.period === "month"
        && fact.currency === evidence.currency && fact.source_refs.length > 0
        && fact.source_refs.every(id => resolved.includes(id))
        && fact.source_refs.some(id => {
          const original = manifest.items.find(item => item.id === id);
          return !!original && /^source_input\[\d+\]$/.test(original.source)
            && /\bTuesday evenings?\b/i.test(original.text) && /\b(?:month|monthly)\b/i.test(original.text)
            && !/\b(?:Monday|Wednesday|Thursday|Friday|Saturday|Sunday|week|weekly|daily|year|yearly)\b/i.test(original.text)
            && original.text.split(/,?\s+(?:but|and)\s+/i).some(part => {
              const labels = [...part.matchAll(measures)], keys = moneyKeys(part).filter(key => key !== null);
              return labels.length > 0 && labels.every(label => role(label[0]) === fact.role)
                && keys.length === 1 && keys[0] === `${fact.currency}:${fact.value}`;
            });
        }))).map(record => record.supporting_facts);
    // Legacy Evidence may have no role record. Accept only a single original
    // statement that itself supplies both unique monetary operands and explicit
    // Tuesday/month context. Never assemble this fallback across statements.
    if (!records.some(record => record.intervention === "headcount_reduction")) {
      for (const original of manifest.items.filter(item => resolved.includes(item.id) && /^source_input\[\d+\]$/.test(item.source))) {
        if (!/\bTuesday evenings?\b/i.test(original.text) || !/\b(?:month|monthly)\b/i.test(original.text)
          || /\b(?:Monday|Wednesday|Thursday|Friday|Saturday|Sunday|week|weekly|daily|year|yearly|per (?:person|worker|order))\b/i.test(original.text)) continue;
        const parts = original.text.split(/,?\s+(?:but|and)\s+/i);
        if (parts.length !== 2) continue;
        const support: AuthorizationRecord["supporting_facts"] = [];
        for (const part of parts) {
          const keys = moneyKeys(part), labels = [...part.matchAll(measures)];
          if (keys.length !== 1 || !keys[0] || labels.length !== 1) break;
          const [currency, amount] = keys[0].split(":");
          // Preserve literal unresolved notation (for example "$"), without
          // inventing an ISO currency alias. Both operands must use the same key.
          if (!Number.isFinite(Number(amount)) || Number(amount) < 0) break;
          support.push({ role: role(labels[0][0]), value: Number(amount), unit: "currency", period: "month", currency, source_refs: [original.id] });
        }
        if (support.length === 2 && new Set(support.map(fact => fact.role)).size === 2
          && support[0].currency === support[1].currency) candidates.push(support);
      }
    }
    if (candidates.length !== 1) return false;
    const support = candidates[0];
    const a = support.find(fact => fact.role === role(left[0]));
    const b = support.find(fact => fact.role === role(right[0]));
    if (!a || !b || !Number.isFinite(a.value) || !Number.isFinite(b.value)) return false;
    // Inline amounts must belong to their bound operand, not just occur in any
    // selected fact. This also refuses cross-unit comparisons and swapped values.
    if (moneyKeys(before).some(key => key !== `${a.currency}:${a.value}`)
      || moneyKeys(after).some(key => key !== `${b.currency}:${b.value}`)) return false;
    for (const [operand, fact] of [[before, a], [after, b]] as const) {
      for (const notation of operand.match(currencyNotation) ?? []) {
        const normalized = normalizeEvidenceCurrency(notation, manifest.source_input);
        if ((normalized.ok && normalized.currency ? normalized.currency : notation) !== fact.currency) return false;
      }
    }
    const word = comparison[0].toLowerCase();
    const valid = /^(?:equal|equivalent)/.test(word) ? a.value === b.value
      : /^(?:less|lower|below)/.test(word) ? a.value < b.value : a.value > b.value;
    if (!valid) return false;
  }
  return true;
}
