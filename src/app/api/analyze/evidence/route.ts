import { observeRoute } from "../../../../lib/observability/langsmith";
import { filterMissingInformation } from "./missing-information";
import { groundBusinessTotals } from "./business-totals";
import { groundCalculationFacts, logCalculationDiagnostic } from "./calculation-facts";
import { assembleAuthorizationRecords } from "./authorization-atoms";
import { validateAuthorizationRecords } from "./authorization-records";
import { createEvidenceOutputSchema, evidenceSystemPrompt, matchesSchema } from "./evidence";
import { createEvidenceProvenance } from "./provenance";
import { normalizeEvidenceCurrency } from "./currency";
import type { Evidence } from "@/types/evidence";
import type { MissingRequirement } from "@/lib/analysis-status";

export const runtime = "nodejs";

// Verified against Nebius documentation and its official Nemotron cookbook.
const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const NEBIUS_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";
const UPSTREAM_TIMEOUT_MS = 60_000;

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const error = (message: string, status: number) => json({ error: message }, status);

type ProviderFailure = "provider_timeout" | "provider_http_error" | "provider_network_error"
  | "provider_empty_response" | "provider_invalid_json" | "provider_schema_invalid" | "provider_response_invalid"
  | "currency_conflict" | "authorization_atom_invalid" | "authorization_record_invalid" | "unhandled_exception";
type AtomFailure = { atom_index: number; atom_kind: string;
  rejection_reason: "invalid_source_refs" | "numeric_anchor_source_missing" | "currency_mismatch" };
type InvalidResponseDiagnostic = {
  invalid_response_subtype: "missing_choice" | "missing_message" | "refusal_present"
    | "non_stop_finish_reason" | "non_string_content" | "envelope_read_exception";
  phase: "completion_guard" | "response_json";
  content_type: "missing" | "null" | "string" | "array" | "object" | "number" | "boolean";
  finish_reason_category: "stop" | "length" | "tool_calls" | "function_call" | "content_filter" | "other";
  refusal_present: boolean;
  tool_calls_present: boolean;
};
const providerDiagnostic = (reason: ProviderFailure, detail: { status?: number; configured_timeout_ms?: number; elapsed_ms?: number } & Partial<AtomFailure> = {},
  failure?: unknown, phase?: "request" | "response_json" | "output", invalidResponse?: () => Partial<InvalidResponseDiagnostic>) => {
  // Fixed classifications only. Never serialize exceptions, messages or causes.
  try {
    if (process.env.NODE_ENV === "production") {
      const classifications: Record<ProviderFailure, string> = {
        provider_http_error: "evidence_provider_non_2xx", provider_timeout: "evidence_provider_timeout",
        provider_network_error: "evidence_provider_network_error", provider_empty_response: phase === "output" ? "evidence_invalid_json" : "evidence_invalid_response",
        provider_invalid_json: "evidence_invalid_json", provider_schema_invalid: "evidence_schema_invalid",
        provider_response_invalid: "evidence_invalid_response", currency_conflict: "evidence_currency_conflict",
        authorization_atom_invalid: "evidence_authorization_atom_invalid",
        authorization_record_invalid: "evidence_authorization_record_invalid", unhandled_exception: "evidence_unhandled_exception",
      };
      let error_name = "unknown";
      try {
        const name = failure && typeof failure === "object" && "name" in failure ? failure.name : undefined;
        if (typeof name === "string" && ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError"].includes(name)) error_name = name;
      } catch { /* Exception properties are not trusted. */ }
      console.warn("[What's Left?] Evidence failure", JSON.stringify({ classification: classifications[reason], ...detail, ...invalidResponse?.(),
        ...(phase ? { phase, error_name } : {}) }));
    } else if (process.env.NODE_ENV === "development" && reason.startsWith("provider_")) {
      console.warn("[What's Left?] Evidence provider rejection", JSON.stringify({ reason, ...detail }));
    }
  } catch { /* Diagnostics must never change the route response. */ }
};

async function handlePOST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON request body.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || !("input" in body) || typeof body.input !== "string" || !body.input.trim()) {
    return error("input must be a non-empty string.", 400);
  }

  const key = process.env.NEBIUS_API_KEY;
  if (!key?.trim()) return error("Evidence service is not configured.", 500);

  // IDs are independent of model extraction. Generate the original-source
  // catalog with unknown scalar fields; this changes no returned provenance IDs.
  const unknownEvidence: Evidence = { business_type: null, period: null, currency: null,
    revenue: { total: null, items: [] }, costs: { total: null, items: [] }, facts: [], assumptions: [], missing_information: [], confidence: "low" };
  const sources = createEvidenceProvenance(unknownEvidence, body.input.trim()).items;
  const outputSchema = createEvidenceOutputSchema(sources.map(source => source.id), true, true);
  let providerPhase: "request" | "response_json" | "output" = "request";
  let providerSignal: AbortSignal | undefined;
  const providerStarted = Date.now();
  try {
    const upstream = await fetch(`${NEBIUS_BASE_URL}chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: (providerSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)),
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        temperature: 0.2,
        max_tokens: 4000,
        // Extraction needs a final JSON answer, not a token budget spent on reasoning.
        chat_template_kwargs: { enable_thinking: false },
        response_format: {
          type: "json_schema",
          json_schema: { name: "evidence", strict: true, schema: outputSchema },
        },
        messages: [
          { role: "system", content: evidenceSystemPrompt },
          { role: "user", content: body.input.trim() },
          { role: "user", content: JSON.stringify({ authorization_sources: sources.map(({ id, text }) => ({ id, text })) }) },
        ],
      }),
    });
    if (!upstream.ok) {
      providerDiagnostic("provider_http_error", { status: upstream.status });
      return error("Evidence provider request failed.", 502);
    }

    providerPhase = "response_json";
    const completion = await upstream.json();
    providerPhase = "output";
    const choice = completion?.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== "stop" || choice?.message?.refusal || typeof content !== "string") {
      providerDiagnostic(choice == null ? "provider_empty_response" : "provider_response_invalid", {}, undefined, undefined, () => {
        const message = choice?.message, finish = choice?.finish_reason;
        const refusal_present = Boolean(message?.refusal);
        // Diagnostic precedence only; the acceptance predicate above is unchanged.
        // missing choice > missing message > refusal > non-stop finish > non-string content.
        return {
          invalid_response_subtype: choice == null ? "missing_choice" : message == null ? "missing_message"
            : refusal_present ? "refusal_present" : finish !== "stop" ? "non_stop_finish_reason" : "non_string_content",
          phase: "completion_guard",
          content_type: content === undefined ? "missing" : content === null ? "null" : Array.isArray(content) ? "array"
            : typeof content === "string" ? "string" : typeof content === "number" ? "number"
              : typeof content === "boolean" ? "boolean" : typeof content === "object" ? "object" : "missing",
          finish_reason_category: finish === "stop" ? "stop" : finish === "length" ? "length"
            : finish === "tool_calls" ? "tool_calls" : finish === "function_call" ? "function_call"
              : finish === "content_filter" ? "content_filter" : "other",
          refusal_present, tool_calls_present: message?.tool_calls != null,
        };
      });
      return error("Evidence provider returned an invalid response.", 502);
    }
    let evidence: unknown;
    try {
      evidence = JSON.parse(content);
    } catch (failure) {
      providerDiagnostic(content.trim() === "" ? "provider_empty_response" : "provider_invalid_json", {}, failure, "output");
      return error("Evidence provider returned invalid JSON.", 502);
    }
    // Total support is extraction-only and optional locally: absent or malformed
    // support nulls totals, never rejects otherwise valid granular Evidence.
    const { business_total_support, calculation_support, ...baseOutput } = evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? evidence as Record<string, unknown> : { business_total_support: undefined, calculation_support: undefined };
    if (!matchesSchema(baseOutput, createEvidenceOutputSchema(sources.map(source => source.id), false))) {
      providerDiagnostic("provider_schema_invalid");
      return error("Evidence provider returned invalid evidence.", 502);
    }
    const { authorization_atoms, ...validated } = baseOutput as Evidence & { authorization_atoms: unknown };
    const normalized = normalizeEvidenceCurrency(validated.currency, body.input);
    if (!normalized.ok) {
      providerDiagnostic("currency_conflict");
      return error("Evidence currency conflicts with the explicit source currency or is unsupported.", 502);
    }
    let atomFailure: AtomFailure | undefined;
    const missingRequirements = new Set<MissingRequirement>();
    const authorization_records = assembleAuthorizationRecords(authorization_atoms, sources, normalized.currency,
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production" ? diagnostic => {
        try {
          if (process.env.NODE_ENV === "development") {
            console.warn("[What's Left?] Evidence authorization atom rejection", JSON.stringify(diagnostic));
          } else if ((diagnostic.reason === "invalid_source_refs" || diagnostic.reason === "numeric_anchor_source_missing"
            || diagnostic.reason === "currency_mismatch") && Number.isSafeInteger(diagnostic.atom_index)
            && diagnostic.atom_index! >= 0 && Array.isArray(authorization_atoms)) {
            const kind = authorization_atoms[diagnostic.atom_index!]?.kind;
            if (typeof kind === "string" && ["scoped_sales", "scoped_staffing_cost", "headcount_reduction_permission",
              "schedule_constraint", "current_waste_rate", "waste_target_rate", "waste_reduction_permission"].includes(kind)) {
              atomFailure = { atom_index: diagnostic.atom_index!, atom_kind: kind, rejection_reason: diagnostic.reason };
            }
          }
        } catch { /* Diagnostics must never affect authorization validation. */ }
      } : undefined,
      diagnostic => {
        if (process.env.NODE_ENV === "development") console.warn("[What's Left?] Evidence authorization assembly", JSON.stringify(diagnostic));
        // Presentation only: use the assembler's existing missing-kind result.
        // Ambiguous/conflicting support is not reported as missing information.
        if (diagnostic.intervention !== "headcount_reduction" || diagnostic.ambiguous_atom_kinds.length
          || diagnostic.conflicting_atom_kinds.length) return;
        const requirements: Partial<Record<string, MissingRequirement>> = { scoped_sales: "tuesday_evening_sales",
          scoped_staffing_cost: "tuesday_evening_staffing_cost", headcount_reduction_permission: "staffing_test_permission",
          schedule_constraint: "unchanged_schedule" };
        for (const kind of diagnostic.missing_required_atom_kinds) {
          const requirement = requirements[kind];
          if (requirement) missingRequirements.add(requirement);
        }
      });
    if (!authorization_records) {
      providerDiagnostic("authorization_atom_invalid", atomFailure);
      return error("Evidence authorization atoms have invalid source support.", 502);
    }
    if (!validateAuthorizationRecords(authorization_records, sources, normalized.currency,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Evidence authorization rejection", JSON.stringify(diagnostic));
      } : undefined)) {
      providerDiagnostic("authorization_record_invalid");
      return error("Evidence authorization records have invalid source support.", 502);
    }
    const grounded = groundBusinessTotals({ ...validated, currency: normalized.currency }, business_total_support, sources);
    if (process.env.NODE_ENV === "development" && business_total_support !== undefined) {
      console.warn("[What's Left?] Evidence business total grounding", JSON.stringify(grounded.diagnostic));
    }
    const canonical = grounded.evidence;
    const groundedCalculationFacts = groundCalculationFacts(calculation_support, sources, canonical,
      process.env.NODE_ENV === "development" ? logCalculationDiagnostic : undefined);
    const calculation_facts = calculation_support === undefined ? undefined : groundedCalculationFacts;
    const filtered = { ...canonical, missing_information: filterMissingInformation(canonical.missing_information, sources) };
    return json({ evidence: { ...filtered, provenance: { ...createEvidenceProvenance(filtered, body.input.trim(), calculation_facts), authorization_records } },
      ...(missingRequirements.size ? { guidance: { missing_requirements: [...missingRequirements] } } : {}) });
  } catch (failure) {
    if (providerPhase !== "output") {
      const name = failure && typeof failure === "object" && "name" in failure ? failure.name : undefined;
      if (providerSignal?.aborted || name === "TimeoutError" || name === "AbortError") {
        providerDiagnostic("provider_timeout", { configured_timeout_ms: UPSTREAM_TIMEOUT_MS,
          elapsed_ms: Math.max(0, Date.now() - providerStarted) }, failure, providerPhase);
      } else if (providerPhase === "response_json" && name === "SyntaxError") {
        providerDiagnostic("provider_invalid_json", {}, failure, providerPhase);
      } else {
        const reason = providerPhase === "request" || name === "TypeError" ? "provider_network_error" : "provider_response_invalid";
        providerDiagnostic(reason, {}, failure, providerPhase, reason === "provider_response_invalid"
          ? () => ({ invalid_response_subtype: "envelope_read_exception" }) : undefined);
      }
    } else {
      providerDiagnostic("unhandled_exception", {}, failure, providerPhase);
    }
    // Do not return/log upstream bodies, exception details, headers, or business input.
    return error("Evidence provider is unavailable or returned an invalid response.", 502);
  }
}

export const POST = observeRoute("evidence-agent", NEBIUS_MODEL, handlePOST);
