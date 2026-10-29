import type { AuthorizationRecord, EvidenceSource } from "@/types/evidence";
import { matchesSchema } from "./evidence";

const text = { type: "string" };
const refs = { type: "array", items: text };
export const authorizationRecordsSchema = {
  type: "array", items: {
    type: "object", additionalProperties: false as const,
    required: ["intervention", "scope", "operation", "from", "value", "unit", "permission", "permission_source_refs", "constraint", "constraint_source_refs", "supporting_facts"],
    properties: {
      intervention: { type: "string", enum: ["headcount_reduction", "waste_rate_target"] },
      scope: { type: "string", enum: ["tuesday_evening_6pm_10pm", "ingredient_waste"] },
      operation: { type: "string", enum: ["delta", "absolute_target"] },
      from: { type: ["number", "null"] }, value: { type: "number" },
      unit: { type: "string", enum: ["persons", "percent"] },
      permission: { type: "string", enum: ["explicit", "absent", "denied"] },
      permission_source_refs: refs,
      constraint: { type: "string", enum: ["affected_scope_only", "rest_schedule_unchanged", "none"] },
      constraint_source_refs: refs,
      supporting_facts: { type: "array", items: {
        type: "object", additionalProperties: false as const,
        required: ["role", "value", "unit", "period", "currency", "source_refs"], properties: {
          role: { type: "string", enum: ["sales", "staffing_cost", "current_waste_rate", "target_waste_rate"] },
          value: { type: "number" }, unit: { type: "string", enum: ["currency", "percent"] },
          period: { type: "string", enum: ["month"] }, currency: { type: ["string", "null"] }, source_refs: refs,
        },
      } },
    },
  },
};

// Structural/source validation of AI extraction, not a natural-language parser.
// Original source identity and literal numeric anchors are checked independently
// of the model's semantic classification. No derived numbers are accepted.
export type AuthorizationRejection = {
  reason: string;
  authorization_record_index?: number;
  intervention?: AuthorizationRecord["intervention"];
  failing_field: string;
  offending_source_id?: string;
  missing_required_support?: string;
  supporting_fact_index?: number;
  returned_role?: AuthorizationRecord["supporting_facts"][number]["role"];
  allowed_roles?: AuthorizationRecord["supporting_facts"][number]["role"][];
};

export function validateAuthorizationRecords(value: unknown, sources: EvidenceSource[], currency: string | null,
  onReject?: (diagnostic: AuthorizationRejection) => void): value is AuthorizationRecord[] {
  if (!matchesSchema(value, authorizationRecordsSchema)) {
    onReject?.({ reason: "schema_mismatch", failing_field: "authorization_records" });
    return false;
  }
  const catalog = new Map(sources.filter(s => /^source_input\[\d+\]$/.test(s.source)).map(s => [s.id, s.text]));
  const anchored = (number: number, ids: string[]) => ids.some(id =>
    (catalog.get(id)?.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).some(token => Number(token.replace(/,/g, "")) === number));
  return (value as AuthorizationRecord[]).every((record, index) => {
    const reject = (reason: string, failing_field: string, detail: Partial<AuthorizationRejection> = {}) => {
      onReject?.({ reason, authorization_record_index: index, intervention: record.intervention, failing_field, ...detail });
      return false;
    };
    const check = (condition: boolean, reason: string, field: string, detail: Partial<AuthorizationRejection> = {}) => condition || reject(reason, field, detail);
    const validRefs = (ids: string[], required: boolean, field: string) => {
      if (required && ids.length === 0) return reject("missing_required_source", field, { missing_required_support: field });
      if (ids.length !== new Set(ids).size) return reject("duplicate_source_id", field);
      for (const id of ids) {
        if (!catalog.has(id)) {
          // IDs are the only source content allowed in diagnostics. Malformed
          // arbitrary strings must never turn this into a prose logging path.
          const safeId = /^(?:src|ev|fact)_[a-f0-9]{32}_\d+$/.test(id) ? id : "[invalid_source_id]";
          return reject(sources.some(source => source.id === id) ? "source_type_mismatch" : "unknown_source_id",
            field, { offending_source_id: safeId });
        }
      }
      return true;
    };
    if (!validRefs(record.permission_source_refs, record.permission === "explicit", "permission_source_refs")
      || !validRefs(record.constraint_source_refs, record.constraint !== "none", "constraint_source_refs")
      || !check(record.permission === "explicit" || record.permission_source_refs.length === 0, "unexpected_permission_source", "permission_source_refs")
      || !check(record.constraint !== "none" || record.constraint_source_refs.length === 0, "unexpected_constraint_source", "constraint_source_refs")
      || !check(record.supporting_facts.length === new Set(record.supporting_facts.map(f => f.role)).size, "duplicate_support_role", "supporting_facts")
      || !record.supporting_facts.every((f, supportIndex) => {
        const field = `supporting_facts[${supportIndex}]`;
        return validRefs(f.source_refs, true, `${field}.source_refs`)
          && check(f.value >= 0, "negative_support_value", `${field}.value`)
          && check(anchored(f.value, f.source_refs), "numeric_anchor_source_missing", `${field}.source_refs`);
      })) return false;
    if (record.intervention === "headcount_reduction") {
      return check(record.scope === "tuesday_evening_6pm_10pm", "authorization_identity_mismatch", "scope")
        && check(record.operation === "delta", "authorization_identity_mismatch", "operation")
        && check(record.from === null, "authorization_identity_mismatch", "from")
        && check(record.value === -1, "authorization_identity_mismatch", "value")
        && check(record.unit === "persons", "authorization_identity_mismatch", "unit")
        && record.supporting_facts.every((f, supportIndex) => {
          const field = `supporting_facts[${supportIndex}]`;
          return check(["sales", "staffing_cost"].includes(f.role), "support_role_mismatch", `${field}.role`, {
            supporting_fact_index: supportIndex, returned_role: f.role, allowed_roles: ["sales", "staffing_cost"],
          })
            && check(f.unit === "currency", "support_unit_mismatch", `${field}.unit`)
            && check(f.currency === currency, "support_currency_mismatch", `${field}.currency`);
        })
        && (record.permission !== "explicit" || (check(record.constraint !== "none", "constraint_source_missing", "constraint")
          && check(anchored(1, record.permission_source_refs), "numeric_anchor_source_missing", "permission_source_refs")));
    }
    return check(record.scope === "ingredient_waste", "authorization_identity_mismatch", "scope")
      && check(record.operation === "absolute_target", "authorization_identity_mismatch", "operation")
      && check(record.unit === "percent", "authorization_identity_mismatch", "unit")
      && check(record.from === 9, "authorization_identity_mismatch", "from")
      && check(record.value === 5, "authorization_identity_mismatch", "value")
      && check(record.constraint === "none", "authorization_identity_mismatch", "constraint")
      && record.supporting_facts.every((f, supportIndex) => {
        const field = `supporting_facts[${supportIndex}]`;
        return check(["current_waste_rate", "target_waste_rate"].includes(f.role), "support_role_mismatch", `${field}.role`, {
          supporting_fact_index: supportIndex, returned_role: f.role, allowed_roles: ["current_waste_rate", "target_waste_rate"],
        })
          && check(f.unit === "percent", "support_unit_mismatch", `${field}.unit`)
          && check(f.currency === null, "support_currency_mismatch", `${field}.currency`);
      })
      && (record.permission !== "explicit" || (check(anchored(9, record.permission_source_refs), "numeric_anchor_source_missing", "permission_source_refs")
        && check(anchored(5, record.permission_source_refs), "numeric_anchor_source_missing", "permission_source_refs")));
  });
}

export function requiredAuthorizationSources(record: AuthorizationRecord): string[] | null {
  if (record.permission !== "explicit") return null;
  const roles = record.intervention === "headcount_reduction" ? ["sales", "staffing_cost"] : ["current_waste_rate", "target_waste_rate"];
  const support = roles.map(role => record.supporting_facts.find(f => f.role === role));
  if (support.some(f => !f)) return null;
  if (record.intervention === "waste_rate_target" && (support[0]!.value !== record.from || support[1]!.value !== record.value)) return null;
  return [...new Set([...support.flatMap(f => f!.source_refs), ...record.permission_source_refs, ...record.constraint_source_refs])];
}
