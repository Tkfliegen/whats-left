import { validateAuthorizationRecords } from "./authorization-records";
import { createHash } from "node:crypto";
import { matchesSchema, evidenceSchema } from "./evidence";
import type { Evidence, EvidenceProvenance } from "@/types/evidence";

// Original source statements are distinct from model-extracted facts. Only the
// former can grant permission. Segmentation preserves numbers and source wording.
export function sourceLines(input: string): string[] {
  return input.split(/\r?\n/)
    .map(line => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ""))
    .filter(Boolean);
}

const splitStatements = (line: string) => line.split(/(?<=[.!?])\s+(?=[A-Z])/u)
  .map(statement => statement.trim()).filter(Boolean);

export function sourceStatements(input: string): string[] {
  return sourceLines(input).flatMap(splitStatements);
}

export function createEvidenceProvenance(evidence: Evidence, input: string): EvidenceProvenance {
  const entries: Array<{ source: string; text: string }> = [];
  const add = (source: string, value: unknown) => {
    if (value !== null && value !== "") entries.push({ source, text: typeof value === "string" ? value : JSON.stringify(value) });
  };
  for (const key of ["business_type", "period", "currency"] as const) add(`evidence.${key}`, evidence[key]);
  for (const key of ["revenue", "costs"] as const) {
    add(`evidence.${key}.total`, evidence[key].total);
    evidence[key].items.forEach((item, i) => add(`evidence.${key}.items[${i}]`, item));
  }
  evidence.facts.forEach((fact, i) => add(`evidence.facts[${i}]`, fact));
  sourceStatements(input).forEach((text, i) => add(`source_input[${i}]`, text));
  const digest = createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 32);
  // Source and citable fact identity depends ONLY on original source data.
  // Model prose can change without changing either identity or lineage.
  const sourceDigest = createHash("sha256").update(JSON.stringify(sourceLines(input))).digest("hex").slice(0, 32);
  let sourceIndex = 0;
  const items = entries.map((item, i) => ({
    id: item.source.startsWith("source_input[")
      ? `src_${sourceDigest}_${String(++sourceIndex).padStart(2, "0")}`
      : `ev_${digest}_${String(i + 1).padStart(2, "0")}`, ...item,
  }));
  const sources = items.filter(item => item.source.startsWith("source_input["));
  const citable_facts = sources.map((item, i) => ({
    id: `fact_${sourceDigest}_${String(i + 1).padStart(2, "0")}`,
    text: item.text, source_refs: [item.id],
  }));
  // A complete original line is also a citable view when it spans several
  // statements. Track positions during segmentation: no text matching or
  // model-selected attribution is used to build these multi-source edges.
  let offset = 0;
  for (const line of sourceLines(input)) {
    const count = splitStatements(line).length;
    if (count > 1) citable_facts.push({
      id: `fact_${sourceDigest}_${String(citable_facts.length + 1).padStart(2, "0")}`,
      text: line, source_refs: sources.slice(offset, offset + count).map(item => item.id),
    });
    offset += count;
  }
  return { source_input: input, items, citable_facts };
}

// Legacy Evidence remains readable downstream, but cannot authorize anything.
// Recompute the manifest rather than trusting client/model-provided IDs or paths.
// This binds identities to this supplied analysis; it is not client authentication.
export function isEvidence(value: unknown, requireProvenance = false): value is Evidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { provenance, ...base } = value as Record<string, unknown>;
  if (!matchesSchema(base, evidenceSchema)) return false;
  if (provenance === undefined) return !requireProvenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return false;
  const record = provenance as Record<string, unknown>;
  if (Object.keys(record).some(key => !["source_input", "items", "citable_facts", "authorization_records"].includes(key)) || typeof record.source_input !== "string" || !record.source_input.trim()
    || !Array.isArray(record.items) || !Array.isArray(record.citable_facts)) return false;
  const expected = createEvidenceProvenance(base as Evidence, record.source_input);
  return (record.authorization_records === undefined || validateAuthorizationRecords(record.authorization_records, expected.items, (base as Evidence).currency))
    && record.items.length === expected.items.length && record.items.every((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const actual = item as Record<string, unknown>, wanted = expected.items[i];
    return Object.keys(actual).length === 3 && actual.id === wanted.id
      && actual.source === wanted.source && actual.text === wanted.text;
  }) && record.citable_facts.length === expected.citable_facts.length && record.citable_facts.every((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const actual = item as Record<string, unknown>, wanted = expected.citable_facts[i];
    return Object.keys(actual).length === 3 && actual.id === wanted.id && actual.text === wanted.text
      && Array.isArray(actual.source_refs) && actual.source_refs.length === wanted.source_refs.length
      && actual.source_refs.every((ref, index) => ref === wanted.source_refs[index]);
  });
}

// Only code-generated citable facts enter this trust chain. Raw source IDs and
// model-prose item IDs are not citable. A malformed manifest cannot be repaired.
export function resolveEvidenceRefs(evidence: Evidence, refs: string[]): string[] | null {
  if (!isEvidence(evidence, true) || refs.length === 0 || new Set(refs).size !== refs.length) return null;
  const resolved: string[] = [];
  for (const ref of refs) {
    const fact = evidence.provenance!.citable_facts.find(item => item.id === ref);
    if (!fact || fact.source_refs.length === 0) return null;
    for (const source of fact.source_refs) if (!resolved.includes(source)) resolved.push(source);
  }
  return resolved;
}
