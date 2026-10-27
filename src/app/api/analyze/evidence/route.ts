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
  | "provider_empty_response" | "provider_invalid_json" | "provider_schema_invalid" | "provider_response_invalid";
const providerDiagnostic = (reason: ProviderFailure, detail: { status?: number; configured_timeout_ms?: number; elapsed_ms?: number } = {}) => {
  if (process.env.NODE_ENV === "development") {
    console.warn("[What's Left?] Evidence provider rejection", JSON.stringify({ reason, ...detail }));
  }
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
      providerDiagnostic(choice == null ? "provider_empty_response" : "provider_response_invalid");
      return error("Evidence provider returned an invalid response.", 502);
    }
    let evidence: unknown;
    try {
      evidence = JSON.parse(content);
    } catch {
      providerDiagnostic(content.trim() === "" ? "provider_empty_response" : "provider_invalid_json");
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
    if (!normalized.ok) return error("Evidence currency conflicts with the explicit source currency or is unsupported.", 502);
    const authorization_records = assembleAuthorizationRecords(authorization_atoms, sources, normalized.currency,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Evidence authorization atom rejection", JSON.stringify(diagnostic));
      } : undefined,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Evidence authorization assembly", JSON.stringify(diagnostic));
      } : undefined);
    if (!authorization_records) return error("Evidence authorization atoms have invalid source support.", 502);
    if (!validateAuthorizationRecords(authorization_records, sources, normalized.currency,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Evidence authorization rejection", JSON.stringify(diagnostic));
      } : undefined)) return error("Evidence authorization records have invalid source support.", 502);
    const grounded = groundBusinessTotals({ ...validated, currency: normalized.currency }, business_total_support, sources);
    if (process.env.NODE_ENV === "development" && business_total_support !== undefined) {
      console.warn("[What's Left?] Evidence business total grounding", JSON.stringify(grounded.diagnostic));
    }
    const canonical = grounded.evidence;
    const groundedCalculationFacts = groundCalculationFacts(calculation_support, sources, canonical,
      process.env.NODE_ENV === "development" ? logCalculationDiagnostic : undefined);
    const calculation_facts = calculation_support === undefined ? undefined : groundedCalculationFacts;
    const filtered = { ...canonical, missing_information: filterMissingInformation(canonical.missing_information, sources) };
    return json({ evidence: { ...filtered, provenance: { ...createEvidenceProvenance(filtered, body.input.trim(), calculation_facts), authorization_records } } });
  } catch (failure) {
    if (providerPhase !== "output") {
      const name = failure && typeof failure === "object" && "name" in failure ? failure.name : undefined;
      if (providerSignal?.aborted || name === "TimeoutError" || name === "AbortError") {
        providerDiagnostic("provider_timeout", { configured_timeout_ms: UPSTREAM_TIMEOUT_MS,
          elapsed_ms: Math.max(0, Date.now() - providerStarted) });
      } else if (providerPhase === "response_json" && name === "SyntaxError") {
        providerDiagnostic("provider_invalid_json");
      } else {
        providerDiagnostic(providerPhase === "request" || name === "TypeError" ? "provider_network_error" : "provider_response_invalid");
      }
    }
    // Do not return/log upstream bodies, exception details, headers, or business input.
    return error("Evidence provider is unavailable or returned an invalid response.", 502);
  }
}

export const POST = observeRoute("evidence-agent", NEBIUS_MODEL, handlePOST);
