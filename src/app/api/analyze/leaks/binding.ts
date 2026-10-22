import type { AuthorizationRecord, Evidence } from "@/types/evidence";
import type { LeakResult } from "@/types/leaks";
import { isEvidence, resolveEvidenceRefs } from "../evidence/provenance";
import { requiredAuthorizationSources } from "../evidence/authorization-records";

type FindingIdentity = Pick<LeakResult["leaks"][number], "category" | "evidence_refs">;
type Intervention = AuthorizationRecord["intervention"];

// Exhaustive over the supported authorization domain, independent of note prose.
const interventionCategory: Record<Intervention, FindingIdentity["category"]> = {
  headcount_reduction: "labor",
  waste_rate_target: "waste",
};

// Called only after finding refs/prose validation. No prose or model binding is
// read, and no citations/authorizations are added or repaired. Invalid trusted
// inputs, duplicate candidates and multiple finding associations remain unbound.
export function resolveLeakInterventions(findings: readonly FindingIdentity[], evidence: Evidence): Array<Intervention | null> {
  const unbound = findings.map(() => null);
  if (!isEvidence(evidence, true)) return unbound;
  const records = evidence.provenance!.authorization_records ?? [];
  const candidates = records.flatMap(record => {
    const sources = requiredAuthorizationSources(record);
    return sources ? [{ record, sources }] : [];
  });
  const matches = findings.map(finding => {
    const sources = resolveEvidenceRefs(evidence, finding.evidence_refs);
    if (!sources) return [];
    return candidates.filter(candidate => interventionCategory[candidate.record.intervention] === finding.category
      && candidate.sources.every(id => sources.includes(id)));
  });
  return matches.map(matched => {
    if (matched.length !== 1) return null;
    const candidate = matched[0];
    // An intervention identity must also identify one eligible record, and one
    // finding. Shared/multiple complete groups cannot select a winner by order.
    if (candidates.filter(other => other.record.intervention === candidate.record.intervention).length !== 1
      || matches.filter(group => group.includes(candidate)).length !== 1) return null;
    return candidate.record.intervention;
  });
}
