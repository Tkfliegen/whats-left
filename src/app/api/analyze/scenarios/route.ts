import type { ScenarioResponse } from "@/types/scenarios";
import { buildScenarioInput, isScenarioRequest, validateScenarioResult, createScenarioSchema, scenarioSystemPrompt } from "./scenarios";

import { ownAbstentionExplanations } from "./abstention";
import { validateScenarioSupport } from "./authorization";

export const runtime = "nodejs";

const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const NEBIUS_MODEL = "nvidia/Nemotron-3_5-Lightning";
const UPSTREAM_TIMEOUT_MS = 60_000;
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const error = (message: string, status: number) => json({ error: message }, status);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON request body.", 400);
  }
  if (!isScenarioRequest(body)) {
    return error("Valid evidence, confirmed leaks and operational_context are required; leak titles must be unique.", 400);
  }
  const key = process.env.NEBIUS_API_KEY;
  if (!key?.trim()) return error("Scenario analysis service is not configured.", 500);

  const input = buildScenarioInput(body);
  const schema = createScenarioSchema(input.input_facts, input.confirmed_leaks);
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
          json_schema: { name: "scenario_agent_v1", strict: true, schema },
        },
        messages: [
          { role: "system", content: `${scenarioSystemPrompt}\nRequired JSON schema:\n${JSON.stringify(schema)}` },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!upstream.ok) return error("Scenario analysis provider request failed.", 502);
    const completion = await upstream.json();
    const choice = completion?.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== "stop" || choice?.message?.refusal || typeof content !== "string") {
      return error("Scenario analysis provider returned an invalid response.", 502);
    }
    let result: unknown;
    try {
      result = JSON.parse(content);
    } catch {
      return error("Scenario analysis provider returned invalid JSON.", 502);
    }
    if (!validateScenarioResult(result, input.input_facts, input.confirmed_leaks)) {
      return error("Scenario analysis result rejected by deterministic validation.", 502);
    }
    const support = validateScenarioSupport(result, input.authorized_changes);
    if (!support.ok) {
      return error(`Scenario analysis result rejected by semantic authorization validation: ${support.reason}.`, 502);
    }
    const response: ScenarioResponse = { scenarios: ownAbstentionExplanations(result), input_facts: input.input_facts };
    return json(response);
  } catch {
    // Never log/return user business data, raw provider content, reasoning, or headers.
    return error("Scenario analysis provider is unavailable or returned an invalid response.", 502);
  }
}
