import type { Evidence } from "@/types/evidence";
import { resolveEvidenceRefs } from "../evidence/provenance";
import { periodKey } from "../evidence/calculation-facts";

const rate = String.raw`(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?\b(?!\s+points?))`;
const actualSource = new RegExp(String.raw`^Tuesday evenings? (?:labou?r|staffing)[ -]cost(?: share| percentage)? (?:is explicitly reported as|is|was) ${rate} of Tuesday evenings? sales(?: (?:monthly|per month))?\.$`, "i");
const targetSource = new RegExp(String.raw`^Management(?:'s|’s)? Tuesday evenings? (?:labou?r|staffing)[ -]cost(?: share| percentage)? target is (?:no more than|at most|<=|≤) ${rate} of Tuesday evenings? sales(?: (?:monthly|per month))?\.$`, "i");
const words = /\b(?:management(?:'s|’s)?|Tuesday|evenings?|labou?r|staffing|cost|share|percentage|percent|actual|current|reported|stated|supplied|explicit|target|limit|maximum|is|are|was|were|which|at|of|sales|revenue|the|a|an|month|monthly|per|affected|period|for|reporting|no)\b/gi;
const numbers = (text: string) => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

// Return null only for a different comparison domain. All owned but ambiguous
// claims fail closed. Percentages are literal facts, never computed from money.
export function verifyLaborShareComparison(before: string, after: string, relation: string,
  evidence: Evidence, refs: string[], laborContext: boolean, moneyKeys: (source: string) => Array<string | null>): boolean | null {
  const text = before + " " + after;
  if (!/\b(?:target|limit|maximum)\b/i.test(text) || !/\b(?:share|percentage|percent|cost)\b|%/i.test(text)) return null;
  const manifest = evidence.provenance!, resolved = resolveEvidenceRefs(evidence, refs);
  const sourceContext = manifest.items.some(item => /^source_input\[\d+\]$/.test(item.source) && resolved?.includes(item.id)
    && (actualSource.test(item.text) || targetSource.test(item.text)));
  if (!(laborContext || sourceContext || /\b(?:labou?r|staffing)\b/i.test(text))) return null;
  if (/\b(?:not|never)\b/i.test(text)) return false;
  if (!resolved || periodKey(evidence.period ?? "") !== "month") return false;
  const records = (manifest.authorization_records ?? []).filter(record => record.intervention === "headcount_reduction"
    && record.scope === "tuesday_evening_6pm_10pm");
  if (records.length !== 1) return false;
  const sales = records[0].supporting_facts.filter(fact => fact.role === "sales" && fact.period === "month" && fact.unit === "currency" && fact.currency === evidence.currency);
  if (sales.length !== 1 || !sales[0].source_refs.length || !sales[0].source_refs.every(id => resolved.includes(id))) return false;
  // Both source assertions explicitly name Tuesday evening sales as denominator.
  // Its selected monthly source establishes the shared reporting-period identity.
  if (!sales[0].source_refs.some(id => {
    const source = manifest.items.find(item => item.id === id);
    return source && /^source_input\[\d+\]$/.test(source.source) && /\bTuesday evenings?\b/i.test(source.text)
      && /\b(?:sales|revenue)\b/i.test(source.text) && moneyKeys(source.text).includes(`${sales[0].currency}:${sales[0].value}`)
      && /\b(?:month|monthly)\b/i.test(source.text) && !/\b(?:Friday|Monday|Wednesday|Thursday|Saturday|Sunday|week|year|quarter)\b/i.test(source.text);
  })) return false;
  const originals = manifest.items.filter(item => /^source_input\[\d+\]$/.test(item.source) && resolved.includes(item.id));
  const extract = (pattern: RegExp, sources = originals) => sources.flatMap(source => {
    const match = pattern.exec(source.text);
    if (!match || numbers(source.text).length !== 1) return [];
    const value = Number(match[1]);return Number.isFinite(value) && value >= 0 ? [value] : [];
  });
  // Unselected conflicting claims can veto support, but never supply it.
  const allOriginals = manifest.items.filter(item => /^source_input\[\d+\]$/.test(item.source));
  if (new Set(extract(actualSource, allOriginals)).size > 1 || new Set(extract(targetSource, allOriginals)).size > 1) return false;
  const actual = extract(actualSource), target = extract(targetSource);
  if (target.length !== 1) return false;
  const word = relation.toLowerCase();
  // A literal upper-bound assertion is not an actual-versus-target comparison.
  if (/\b(?:target|limit|maximum)(?:\s+(?:of|is|was))?\s+no\s*$/i.test(before) && word === "more than") {
    // Parent comparisons are verified separately by the caller. Here verify
    // the embedded upper-bound reference, preserving its exact literal value.
    const syntax = text.replace(/\b(?:exceeds?|exceeded|exceeding|greater than|higher than|more than|less than|lower than|below|above|equal to|equivalent to|equals?)\b/gi, "");
    return !/\p{L}/u.test(syntax.replace(words, ""))
      && numbers(before).every(value => value === target[0] || actual.length === 1 && value === actual[0])
      && numbers(after).length === 1 && numbers(after)[0] === target[0]
      && new RegExp(rate, "i").test(after);
  }
  // Parse a target qualified by its reported upper bound as the same operand;
  // do not strip an arbitrary negation or a different numeric bound.
  const bound = new RegExp(String.raw`\b((?:target|limit|maximum)(?:\s+of)?\s+)(?:no more than|at most)\s+(${rate})`, "gi");
  const operandText = (part: string) => part.replace(bound, (match, prefix, literalRate, value) => Number(value) === target[0] ? prefix + literalRate : match);
  const leftText = operandText(before), rightText = operandText(after), parsed = leftText + " " + rightText;
  if (actual.length !== 1 || /\bno\b/i.test(parsed) || /\p{L}/u.test(parsed.replace(words, ""))) return false;
  const operand = (part: string) => /\b(?:target|limit|maximum)\b/i.test(part) ? "target"
    : /\b(?:share|percentage|percent|actual)\b|%/i.test(part) ? "actual" : null;
  const left = operand(before), right = operand(after);
  if (!left || !right || left === right) return false;
  const a = left === "actual" ? actual[0] : target[0], b = right === "actual" ? actual[0] : target[0];
  if (numbers(before).some(value => value !== a) || numbers(after).some(value => value !== b)) return false;
  return /^(?:equal|equivalent)/.test(word) ? a === b : /^(?:less|lower|below)/.test(word) ? a < b : a > b;
}
