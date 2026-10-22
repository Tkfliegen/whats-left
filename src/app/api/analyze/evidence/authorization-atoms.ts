import type { AuthorizationAtom, AuthorizationRecord, EvidenceSource } from "@/types/evidence";
import { matchesSchema, type Schema } from "./evidence";

const literal = (value: string | number): Schema => ({ type: typeof value, const: value });
const number: Schema = { type: "number" };
const text: Schema = { type: "string" };
const laborScope = literal("tuesday_evening_6pm_10pm");
const wasteScope = literal("ingredient_waste");

export function createAuthorizationAtomsSchema(sourceIds?: string[]): Schema {
  const source_refs: Schema = { type: "array", items: sourceIds ? { type: "string", enum: sourceIds } : text };
  const atom = (kind: AuthorizationAtom["kind"], fields: Record<string, Schema>): Schema => {
    const properties = { kind: literal(kind), ...fields, source_refs };
    return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
  };
  return { type: "array", items: { type: "object", anyOf: [
    atom("scoped_sales", { scope: laborScope, period: literal("month"), amount: number, currency: text }),
    atom("scoped_staffing_cost", { scope: laborScope, period: literal("month"), amount: number, currency: text }),
    atom("headcount_reduction_permission", { scope: laborScope, operation: literal("delta"), value: literal(-1), unit: literal("persons"), permission: literal("explicit") }),
    atom("schedule_constraint", { intervention: literal("headcount_reduction"), scope: laborScope, constraint: literal("rest_schedule_unchanged") }),
    atom("current_waste_rate", { scope: wasteScope, value: number, unit: literal("percent") }),
    atom("waste_target_rate", { scope: wasteScope, value: number, unit: literal("percent") }),
    atom("waste_reduction_permission", { scope: wasteScope, from: literal(9), value: literal(5), unit: literal("percent"), permission: literal("explicit") }),
  ] } };
}

export type AtomRejection = { reason: "atom_schema_invalid" | "invalid_source_refs" | "numeric_anchor_source_missing" | "currency_mismatch";
  atom_index?: number; failing_field: string };

// Literal numeric anchors only: this never classifies source prose or recovers
// missing atoms. Semantic kinds/scope must be explicitly extracted by the AI.
export function validateAuthorizationAtoms(value: unknown, sources: EvidenceSource[], currency: string | null,
  onReject?: (diagnostic: AtomRejection) => void): value is AuthorizationAtom[] {
  if (!matchesSchema(value, createAuthorizationAtomsSchema())) {
    onReject?.({ reason: "atom_schema_invalid", failing_field: "authorization_atoms" });
    return false;
  }
  const catalog = new Map(sources.filter(s => /^source_input\[\d+\]$/.test(s.source)).map(s => [s.id, s.text]));
  return (value as AuthorizationAtom[]).every((atom, atom_index) => {
    const reject = (reason: AtomRejection["reason"], failing_field: string) => {
      onReject?.({ reason, atom_index, failing_field });
      return false;
    };
    if (atom.source_refs.length === 0 || new Set(atom.source_refs).size !== atom.source_refs.length
      || !atom.source_refs.every(id => catalog.has(id))) return reject("invalid_source_refs", "source_refs");
    const anchored = (value: number) => atom.source_refs.some(id =>
      (catalog.get(id)!.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).some(token => Number(token.replace(/,/g, "")) === value));
    if (atom.kind === "scoped_sales" || atom.kind === "scoped_staffing_cost") {
      if (atom.amount < 0 || !anchored(atom.amount)) return reject("numeric_anchor_source_missing", "amount");
      if (atom.currency !== currency) return reject("currency_mismatch", "currency");
    } else if (atom.kind === "headcount_reduction_permission") {
      if (!anchored(1)) return reject("numeric_anchor_source_missing", "value");
    } else if (atom.kind === "waste_reduction_permission") {
      if (!anchored(atom.from) || !anchored(atom.value)) return reject("numeric_anchor_source_missing", "from/value");
    } else if (atom.kind === "current_waste_rate" || atom.kind === "waste_target_rate") {
      if (atom.value < 0 || !anchored(atom.value)) return reject("numeric_anchor_source_missing", "value");
    }
    return true;
  });
}

type AtomKind = AuthorizationAtom["kind"];
export type AssemblyDiagnostic = {
  reason: "authorization_atom_assembly_incomplete";
  intervention: AuthorizationRecord["intervention"];
  returned_atom_kinds: AtomKind[];
  atom_counts: Partial<Record<AtomKind, number>>;
  missing_required_atom_kinds: AtomKind[];
  ambiguous_atom_kinds: AtomKind[];
  conflicting_atom_kinds: AtomKind[];
};

// One authoritative producer. Invalid atoms reject the extraction; missing or
// duplicate atom kinds never produce a grant. Nothing is inferred or repaired.
export function assembleAuthorizationRecords(value: unknown, sources: EvidenceSource[], currency: string | null,
  onReject?: (diagnostic: AtomRejection) => void,
  onIncomplete?: (diagnostic: AssemblyDiagnostic) => void): AuthorizationRecord[] | null {
  if (!validateAuthorizationAtoms(value, sources, currency, onReject)) return null;
  const counts: Partial<Record<AtomKind, number>> = {};
  const conflicting = new Set<AtomKind>();
  const compatible = (condition: boolean, ...kinds: AtomKind[]) => {
    if (!condition) kinds.forEach(kind => conflicting.add(kind));
    return condition;
  };
  const one = <K extends AuthorizationAtom["kind"]>(kind: K) => {
    const matches = value.filter(atom => atom.kind === kind);
    counts[kind] = matches.length;
    return matches.length === 1 ? matches[0] as AuthorizationAtom & { kind: K } : undefined;
  };
  // Describe the selections and comparisons used by the actual assembler;
  // diagnostics never repeat policy evaluation or inspect source prose.
  const report = (intervention: AuthorizationRecord["intervention"], kinds: AtomKind[]) => {
    onIncomplete?.({ reason: "authorization_atom_assembly_incomplete", intervention,
      returned_atom_kinds: [...new Set(value.filter(atom => kinds.includes(atom.kind)).map(atom => atom.kind))],
      atom_counts: Object.fromEntries(kinds.map(kind => [kind, counts[kind] ?? 0])),
      missing_required_atom_kinds: kinds.filter(kind => counts[kind] === 0),
      ambiguous_atom_kinds: kinds.filter(kind => (counts[kind] ?? 0) > 1),
      conflicting_atom_kinds: kinds.filter(kind => conflicting.has(kind)),
    });
  };
  const refs = (atom: AuthorizationAtom) => [...new Set(atom.source_refs)];
  const records: AuthorizationRecord[] = [];
  const sales = one("scoped_sales"), cost = one("scoped_staffing_cost");
  const permission = one("headcount_reduction_permission"), constraint = one("schedule_constraint");
  if (sales && cost && permission && constraint && compatible(sales.scope === cost.scope, "scoped_sales", "scoped_staffing_cost")
    && compatible(sales.period === cost.period, "scoped_sales", "scoped_staffing_cost")
    && compatible(sales.currency === cost.currency, "scoped_sales", "scoped_staffing_cost")
    && compatible(permission.scope === sales.scope, "headcount_reduction_permission", "scoped_sales")
    && compatible(constraint.scope === sales.scope, "schedule_constraint", "scoped_sales")) {
    records.push({ intervention: "headcount_reduction", scope: sales.scope, operation: "delta", from: null,
      value: permission.value, unit: "persons", permission: "explicit", permission_source_refs: refs(permission),
      constraint: constraint.constraint, constraint_source_refs: refs(constraint), supporting_facts: [
        { role: "sales", value: sales.amount, unit: "currency", period: sales.period, currency: sales.currency, source_refs: refs(sales) },
        { role: "staffing_cost", value: cost.amount, unit: "currency", period: cost.period, currency: cost.currency, source_refs: refs(cost) },
      ] });
  } else if (value.some(atom => ["scoped_sales", "scoped_staffing_cost", "headcount_reduction_permission", "schedule_constraint"].includes(atom.kind))) {
    report("headcount_reduction", ["scoped_sales", "scoped_staffing_cost", "headcount_reduction_permission", "schedule_constraint"]);
  }
  const current = one("current_waste_rate"), target = one("waste_target_rate"), wastePermission = one("waste_reduction_permission");
  if (current && target && wastePermission && compatible(current.scope === target.scope, "current_waste_rate", "waste_target_rate")
    && compatible(target.scope === wastePermission.scope, "waste_target_rate", "waste_reduction_permission")
    && compatible(current.value === wastePermission.from, "current_waste_rate", "waste_reduction_permission")
    && compatible(target.value === wastePermission.value, "waste_target_rate", "waste_reduction_permission")) {
    records.push({ intervention: "waste_rate_target", scope: current.scope, operation: "absolute_target", from: current.value,
      value: target.value, unit: "percent", permission: "explicit", permission_source_refs: refs(wastePermission),
      constraint: "none", constraint_source_refs: [], supporting_facts: [
        { role: "current_waste_rate", value: current.value, unit: "percent", period: "month", currency: null, source_refs: refs(current) },
        { role: "target_waste_rate", value: target.value, unit: "percent", period: "month", currency: null, source_refs: refs(target) },
      ] });
  } else if (value.some(atom => atom.kind === "waste_reduction_permission")) {
    report("waste_rate_target", ["current_waste_rate", "waste_target_rate", "waste_reduction_permission"]);
  }
  return records;
}
