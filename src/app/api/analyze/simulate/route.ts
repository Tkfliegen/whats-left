import { logCalculationHandoff } from "../evidence/calculation-facts";
import { observeRoute } from "../../../../lib/observability/langsmith";
import { calculateScenarios, isSimulationRequest } from "@/lib/scenario-calculator";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function handlePOST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON request body." }, 400); }
  if (!isSimulationRequest(body)) return json({ error: "Valid evidence, scenarios and source facts are required." }, 400);
  logCalculationHandoff("simulate_input", body.input_facts);
  return json(calculateScenarios(body));
}

export const POST = observeRoute("scenario-calculator", undefined, handlePOST);
