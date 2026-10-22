import type { BusinessTotalSupport, Evidence, EvidenceSource } from "@/types/evidence";
import { matchesSchema, type Schema } from "./evidence";

export function createBusinessTotalSupportSchema(sourceIds?: string[]): Schema {
  const properties: Record<string, Schema> = {
    field: { type: "string", enum: ["revenue.total", "costs.total"] },
    value: { type: "number" }, scope: { type: "string", const: "whole_business" },
    period: { type: "string" }, currency: { type: "string" },
    source_refs: { type: "array", items: sourceIds ? { type: "string", enum: sourceIds } : { type: "string" } },
  };
  return { type: "array", items: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } };
}

// Extraction classifies whole-business semantics; code verifies the declared
// relationships. Never parse prose roles, derive totals or use item sums here.
export function groundBusinessTotals(evidence: Evidence, support: unknown, sources: EvidenceSource[]) {
  const catalog = new Map(sources.filter(s => /^source_input\[\d+\]$/.test(s.source)).map(s => [s.id, s.text]));
  const records = Array.isArray(support) ? support : [];
  const checks = (["revenue", "costs"] as const).map(key => {
    const field = `${key}.total` as BusinessTotalSupport["field"];
    const candidates = records.filter(record => record && typeof record === "object" && record.field === field);
    const failures: string[] = [];
    const accepted = candidates.filter(record => {
      const fail = (reason: string) => { failures.push(reason); return false; };
      if (!matchesSchema([record], createBusinessTotalSupportSchema())) return fail("invalid_support_record");
      const item = record as BusinessTotalSupport;
      if (item.source_refs.length === 0 || new Set(item.source_refs).size !== item.source_refs.length
        || !item.source_refs.every(id => catalog.has(id))) return fail("invalid_source_refs");
      if (evidence.currency === null || item.currency !== evidence.currency) return fail("currency_mismatch");
      if (!evidence.period?.trim() || item.period !== evidence.period) return fail("period_mismatch");
      if (item.value !== evidence[key].total) return fail("total_value_mismatch");
      if (!item.source_refs.some(id => (catalog.get(id)!.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [])
        .some(token => Number(token.replace(/,/g, "")) === item.value))) return fail("numeric_anchor_source_missing");
      return true;
    });
    // Duplicate/conflicting records are ambiguous even if one passes checks.
    const valid = candidates.length === 1 && accepted.length === 1;
    return { field, emitted_support_count: candidates.length, validated_support_count: accepted.length,
      original_total: evidence[key].total, trusted_total: valid ? evidence[key].total : null,
      reasons: candidates.length === 0 ? ["missing_support"] : candidates.length > 1 ? ["ambiguous_support", ...failures] : failures };
  });
  return {
    evidence: { ...evidence, revenue: { ...evidence.revenue, total: checks[0].trusted_total },
      costs: { ...evidence.costs, total: checks[1].trusted_total } },
    // Safe structured development metadata, not source/provider prose.
    diagnostic: { reason: "business_total_grounding", emitted_record_count: records.length, fields: checks,
      records: records.map(record => {
        const r = record && typeof record === "object" ? record : {};
        return { field: ["revenue.total", "costs.total"].includes(r.field) ? r.field : "[invalid_field]",
          scope: r.scope === "whole_business" ? r.scope : "[invalid_scope]",
          value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null,
          period_matches: !!evidence.period?.trim() && r.period === evidence.period,
          currency_matches: evidence.currency !== null && r.currency === evidence.currency,
          source_refs: Array.isArray(r.source_refs) ? r.source_refs.map((id: unknown) => typeof id === "string" && catalog.has(id) ? id : "[invalid_source_id]") : [] };
      }) },
  };
}
