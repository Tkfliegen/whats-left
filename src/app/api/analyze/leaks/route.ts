import { observeRoute } from "../../../../lib/observability/langsmith";
import type { LeakRequest, LeakResponse, ModelLeakResult } from "@/types/leaks";
import { isLeakRequest, isLeakResult, isModelLeakResult, createLeakSchema, buildLeakInput, leakSystemPrompt } from "./leaks";
import { validateLeakOutput } from "./output";

import { resolveLeakInterventions } from "./binding";
import { requiredAuthorizationSources } from "../evidence/authorization-records";
import { resolveEvidenceRefs } from "../evidence/provenance";

export const runtime = "nodejs";

const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const NEBIUS_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";
const FALLBACK_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const UPSTREAM_TIMEOUT_MS = 60_000;
type RetryReason = "unreported_number" | "unreported_numeric_unit" | "unverified_comparison";
const correctiveReasons = new Set<string>(["unreported_number", "unreported_numeric_unit", "unverified_comparison"]);
const correction: Record<RetryReason, string> = {
  unreported_number: "An unsupported numeric value was introduced. ",
  unreported_numeric_unit: "A numeric claim lacked matching monetary, currency or percentage-unit support. ",
  unverified_comparison: "A comparative claim was contradicted or could not be uniquely verified against cited values. ",
};
const correctiveFeedback = "Regenerate the complete Leak response from the same trusted evidence. The previous response contained unsupported or contradicted quantitative claims. Use only cited source facts. Do not calculate or introduce percentages, shares, margins, savings, ratios, differences or monetary values absent from the supplied citable facts. Never claim that a value exceeds or is greater than another unless their cited values support it. If a quantitative conclusion cannot be supported, state only a source-supported qualitative finding, or use insufficient_evidence when inefficiency itself is unproven. Return the required JSON schema. Do not invent, add or repair source facts or citations.";
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const error = (message: string, status: number) => json({ error: message }, status);

async function handlePOST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON request body.", 400);
  }
  if (!isLeakRequest(body)) {
    return error("Valid evidence and an operational_context array of non-empty strings are required.", 400);
  }
  const key = process.env.NEBIUS_API_KEY;
  if (!key?.trim()) return error("Leak analysis service is not configured.", 500);

  const input: LeakRequest = {
    evidence: body.evidence,
    operational_context: body.operational_context.map(item => item.trim()),
  };
  let generation: "primary_initial" | "primary_corrective_retry" | "fallback_attempt" = "primary_initial";
  let model = NEBIUS_MODEL;
  const rejectionReasons: RetryReason[] = [];
  let retryReason: RetryReason | null = null;
  const diagnostic = (final_validation_result: "not_evaluated" | "corrective_retry_pending" | "fallback_pending" | "accepted" | "rejected", final_outcome: "pending" | "accepted" | "abstained" | "rejected" | "provider_failure" = final_validation_result === "accepted" ? "accepted" : final_validation_result === "rejected" ? "rejected" : "pending") => {
    try { console.info("[What's Left?] Leak generation", JSON.stringify({ generation, model, retry_reason: retryReason, final_validation_result, final_outcome })); }
    catch { /* Observability must never affect validation or the response. */ }
  };
  try {
    // All three possible generations share the original upstream time budget.
    const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
    const sourceInput = JSON.stringify(buildLeakInput(input));
    const generate = async (): Promise<{ result: ModelLeakResult } | { response: Response }> => {
      diagnostic("not_evaluated");
      const upstream = await fetch(`${NEBIUS_BASE_URL}chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: generation === "fallback_attempt" ? 8000 : 4000,
          chat_template_kwargs: { enable_thinking: generation === "fallback_attempt" },
          response_format: {
            type: "json_schema",
            json_schema: { name: "leak_detective_v1", strict: true, schema: createLeakSchema(input.evidence) },
          },
          messages: [
            { role: "system", content: leakSystemPrompt },
            { role: "user", content: sourceInput },
            ...(retryReason ? [{ role: "system", content: [...new Set(rejectionReasons)].map(reason => correction[reason]).join("") + correctiveFeedback
              + (generation === "fallback_attempt" ? " Both prior generations failed quantitative verification. Do not claim staffing cost exceeds sales when the supplied staffing cost is lower. Do not fabricate savings or infer authorization beyond supplied records. Reason privately; return only the required final JSON." : "") }] : []),
          ],
        }),
      });
      if (!upstream.ok) return { response: error("Leak analysis provider request failed.", 502) };
      const completion = await upstream.json();
      const choice = completion?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason !== "stop" || choice?.message?.refusal || typeof content !== "string") {
        return { response: error("Leak analysis provider returned an invalid response.", 502) };
      }
      let result: unknown;
      try {
        result = JSON.parse(content);
      } catch {
        return { response: error("Leak analysis provider returned invalid JSON.", 502) };
      }
      if (!isModelLeakResult(result, input.evidence)) return { response: error("Leak analysis provider returned invalid findings.", 502) };
      return { result };
    };
    const validate = (result: ModelLeakResult) => validateLeakOutput(result, input.evidence,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Backend Leak rejection", JSON.stringify(diagnostic));
      } : undefined,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Backend Leak rejection", JSON.stringify(diagnostic));
      } : undefined);
    let generated = await generate();
    if ("response" in generated) {
      diagnostic("not_evaluated", "rejected");
      return generated.response;
    }
    let result = generated.result;
    let output = validate(result);
    const records = input.evidence.provenance!.authorization_records ?? [];
    const ambiguousAuthorization = records.some(record => records.filter(other => other.intervention === record.intervention).length > 1);
    if (!output.ok && correctiveReasons.has(output.reason) && !ambiguousAuthorization && !signal.aborted) {
      retryReason = output.reason as RetryReason;
      rejectionReasons.push(retryReason);
      diagnostic("corrective_retry_pending");
      generation = "primary_corrective_retry";
      generated = await generate(); // Exactly one additional generation; never a loop.
      if ("response" in generated) {
        diagnostic("not_evaluated", "rejected");
        return generated.response;
      }
      result = generated.result;
      output = validate(result);
    }
    const fallbackAuthorized = () => records.some(record => {
      const required = requiredAuthorizationSources(record);
      if (!required) return false;
      const category = record.intervention === "headcount_reduction" ? "labor" : "waste";
      return result.leaks.filter(finding => {
        const refs = resolveEvidenceRefs(input.evidence, finding.evidence_refs);
        return finding.category === category && refs && required.every(id => refs.includes(id));
      }).length === 1;
    });
    if (!output.ok && generation === "primary_corrective_retry" && correctiveReasons.has(output.reason)
      && !ambiguousAuthorization && !signal.aborted && fallbackAuthorized()) {
      retryReason = output.reason as RetryReason;
      rejectionReasons.push(retryReason);
      diagnostic("fallback_pending");
      generation = "fallback_attempt";
      model = FALLBACK_MODEL;
      generated = await generate(); // One final model switch. No fourth generation.
      if ("response" in generated) {
        diagnostic("not_evaluated", "rejected");
        return generated.response;
      }
      result = generated.result;
      output = validate(result);
    }
    if (!output.ok) {
      diagnostic("rejected");
      return error(`Leak analysis result rejected by output validation: ${output.reason}.`, 502);
    }
    const bindings = resolveLeakInterventions(result.leaks, input.evidence);
    const trusted = { ...result, leaks: result.leaks.map((finding, index) => ({
      ...finding, intervention_ref: bindings[index],
    })) };
    if (!isLeakResult(trusted, input.evidence)) {
      diagnostic("rejected");
      return error("Leak analysis provider returned invalid findings.", 502);
    }
    diagnostic("accepted", trusted.leaks.length === 0 ? "abstained" : "accepted");
    const response: LeakResponse = { leaks: trusted };
    return json(response);
  } catch {
    diagnostic("not_evaluated", "provider_failure");
    // Never log/return user business data, raw provider content, reasoning, or headers.
    return error("Leak analysis provider is unavailable or returned an invalid response.", 502);
  }
}

export const POST = observeRoute("leak-detective", NEBIUS_MODEL, handlePOST);
