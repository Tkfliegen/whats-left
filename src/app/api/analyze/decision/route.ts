import { observeRoute } from "../../../../lib/observability/langsmith";
import type { DecisionResponse } from "@/types/decision";
import { buildDecisionInput, decisionSchema, decisionSystemPrompt, isDecisionRequest, validateDecisionResult } from "./decision";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status: number) => json({ error: message }, status);

async function handlePOST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return error("Invalid JSON request body.", 400); }
  if (!isDecisionRequest(body)) return error("Verified upstream results and a consistent Decision Gate with grounded priority sources are required.", 400);
  const key = process.env.NEBIUS_API_KEY;
  if (!key?.trim()) return error("Decision analysis service is not configured.", 500);
  try {
    const upstream = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: "nvidia/Nemotron-3-Ultra-550b-a55b", temperature: 0.2, max_tokens: 2000,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: "json_schema", json_schema: { name: "decision_agent_v1", strict: true, schema: decisionSchema } },
        messages: [{ role: "system", content: `${decisionSystemPrompt}\nRequired JSON schema:\n${JSON.stringify(decisionSchema)}` },
          { role: "user", content: JSON.stringify(buildDecisionInput(body)) }],
      }),
    });
    if (!upstream.ok) return error("Decision analysis provider request failed.", 502);
    const completion = await upstream.json();
    const choice = completion?.choices?.[0], message = choice?.message, content = message?.content;
    if (choice?.finish_reason !== "stop" || message?.refusal || typeof content !== "string"
      || [message?.reasoning, message?.reasoning_content, message?.analysis].some(value => typeof value === "string" && value.trim().length > 0)
      || /<\/?(?:think|analysis)>/i.test(content)) return error("Decision analysis provider returned an invalid response.", 502);
    let result: unknown;
    try { result = JSON.parse(content); }
    catch { return error("Decision analysis provider returned invalid JSON.", 502); }
    const validation = validateDecisionResult(result, body);
    if (!validation.ok) return error(`Decision analysis result rejected by deterministic validation: ${validation.reason}.`, 502);
    const response: DecisionResponse = { decision: result as DecisionResponse["decision"] };
    return json(response);
  } catch {
    // No business data, provider messages, reasoning or credentials are logged/returned.
    return error("Decision analysis provider is unavailable or returned an invalid response.", 502);
  }
}

export const POST = observeRoute("decision-agent", "nvidia/Nemotron-3-Ultra-550b-a55b", handlePOST);
