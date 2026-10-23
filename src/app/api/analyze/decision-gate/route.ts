import { observeRoute } from "../../../../lib/observability/langsmith";
import { evaluateDecisionGate, isDecisionGateRequest } from "@/lib/decision-gate";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function handlePOST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON request body." }, 400); }
  if (!isDecisionGateRequest(body)) return json({ error: "Valid evidence and exactly joined Scenario/Simulation results with finite nonnegative impacts are required." }, 400);
  return json(evaluateDecisionGate(body));
}

export const POST = observeRoute("decision-gate", undefined, handlePOST);
