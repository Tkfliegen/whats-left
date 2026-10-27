import { observeRoute } from "../../../../lib/observability/langsmith";
import type { LeakRequest, LeakResponse } from "@/types/leaks";
import { isLeakRequest, isLeakResult, isModelLeakResult, createLeakSchema, buildLeakInput, leakSystemPrompt } from "./leaks";
import { validateLeakOutput } from "./output";

import { resolveLeakInterventions } from "./binding";

export const runtime = "nodejs";

const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const NEBIUS_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";
const UPSTREAM_TIMEOUT_MS = 60_000;
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
  try {
    const upstream = await fetch(`${NEBIUS_BASE_URL}chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        temperature: 0.2,
        max_tokens: 4000,
        chat_template_kwargs: { enable_thinking: false },
        response_format: {
          type: "json_schema",
          json_schema: { name: "leak_detective_v1", strict: true, schema: createLeakSchema(input.evidence) },
        },
        messages: [
          { role: "system", content: leakSystemPrompt },
          { role: "user", content: JSON.stringify(buildLeakInput(input)) },
        ],
      }),
    });
    if (!upstream.ok) return error("Leak analysis provider request failed.", 502);
    const completion = await upstream.json();
    const choice = completion?.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== "stop" || choice?.message?.refusal || typeof content !== "string") {
      return error("Leak analysis provider returned an invalid response.", 502);
    }
    let result: unknown;
    try {
      result = JSON.parse(content);
    } catch {
      return error("Leak analysis provider returned invalid JSON.", 502);
    }
    if (!isModelLeakResult(result, input.evidence)) return error("Leak analysis provider returned invalid findings.", 502);
    const output = validateLeakOutput(result, input.evidence,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Backend Leak rejection", JSON.stringify(diagnostic));
      } : undefined,
      process.env.NODE_ENV === "development" ? diagnostic => {
        console.warn("[What's Left?] Backend Leak rejection", JSON.stringify(diagnostic));
      } : undefined);
    if (!output.ok) {
      return error(`Leak analysis result rejected by output validation: ${output.reason}.`, 502);
    }
    const bindings = resolveLeakInterventions(result.leaks, input.evidence);
    const trusted = { ...result, leaks: result.leaks.map((finding, index) => ({
      ...finding, intervention_ref: bindings[index],
    })) };
    if (!isLeakResult(trusted, input.evidence)) return error("Leak analysis provider returned invalid findings.", 502);
    const response: LeakResponse = { leaks: trusted };
    return json(response);
  } catch {
    // Never log/return user business data, raw provider content, reasoning, or headers.
    return error("Leak analysis provider is unavailable or returned an invalid response.", 502);
  }
}

export const POST = observeRoute("leak-detective", NEBIUS_MODEL, handlePOST);
