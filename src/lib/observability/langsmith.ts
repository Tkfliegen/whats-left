import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Client, RunTree } from "langsmith";

export const TRACE_HEADER = "x-whats-left-trace";
type Stage = "evidence-agent" | "leak-detective" | "scenario-agent" | "scenario-authorization"
  | "scenario-authorization-validation" | "scenario-calculator" | "decision-gate" | "decision-agent";
type Metadata = Record<string, string | number | boolean>;
type TraceContext = { id: string; started: number };
type Event = { stage: Stage; started: number; ended: number; success: boolean; model?: string };
type Active = { context: TraceContext; events: Event[] };
type Environment = Record<string, string | undefined>;
type Dependencies = {
  sdk: () => Promise<Pick<typeof import("langsmith"), "Client" | "RunTree">>;
  schedule: (task: () => Promise<void>) => void | Promise<void>;
};
const defaultDependencies: Dependencies = {
  sdk: () => import("langsmith"),
  schedule: async task => { const { after } = await import("next/server"); after(task); },
};
const knownReasons = new Set(["unreported_number", "incomplete_citation_support", "unsupported_quantitative_ratio",
  "no_authorized_change", "unauthorized_variable", "unauthorized_change", "duplicate_controlled_change",
  "missing_authorization_refs", "authorized_leak_abstained"]);

// No source notes, prompts, headers, provider bodies or numeric business values
// enter the SDK. Only this allowlisted, bounded outcome summary is uploaded.
async function outcome(response: Response | undefined): Promise<Metadata> {
  if (!response) return { outcome: "failed", validation_result: "unknown", error_type: "internal_route_error" };
  const metadata: Metadata = { http_status: response.status, outcome: response.ok ? "accepted" : "rejected",
    validation_result: response.ok ? "passed" : "unknown" };
  let body;
  try { body = await response.json(); } catch { return metadata; }
  const business = body?.evidence?.business_type;
  if (typeof business === "string") {
    const type = business.toLowerCase().replace(/ /g, "_");
    if (["café", "cafe", "bakery", "tea_shop", "restaurant", "other", "bagel_shop"].includes(type)) metadata.business_type = type;
  }
  const decision = body?.decision?.decision_status;
  if (["actionable", "needs_more_data"].includes(decision)) metadata.decision_status = decision;
  if (["needs_more_data", "action_allowed", "no_actionable_scenario"].includes(body?.decision_gate)) metadata.decision_gate = body.decision_gate;
  if (typeof body?.error === "string") {
    const error: string = body.error;
    if (/validation|invalid findings|invalid source support|grounding/i.test(error)) {
      metadata.validation_result = "rejected";
      metadata.error_type = "validation_rejection";
      const reason = error.match(/validation: ([a-z_]+)/)?.[1];
      if (reason && knownReasons.has(reason)) metadata.validation_reason = reason;
    } else if (/provider request failed/i.test(error)) metadata.error_type = "provider_http_error";
    else if (/provider returned invalid JSON/i.test(error)) metadata.error_type = "provider_invalid_json";
    else if (/provider.*unavailable|provider.*invalid response/i.test(error)) metadata.error_type = "provider_unavailable_or_invalid_response";
    else if (response.status === 400) metadata.error_type = "invalid_request";
    if (String(metadata.error_type ?? "").startsWith("provider_")) metadata.validation_result = "not_reached";
  }
  return metadata;
}

export function createObservability(env: Environment, dependencies: Dependencies = defaultDependencies) {
  const storage = new AsyncLocalStorage<Active>();
  let announced = false;
  const diagnostic = (reason: string) => {
    try { if (env.NODE_ENV === "development") console.warn("[What's Left?] LangSmith tracing", JSON.stringify({ reason })); } catch { /* Logging is optional. */ }
  };
  function tracingEnabled() {
    const enabled = env.LANGSMITH_TRACING === "true" && !!env.LANGSMITH_API_KEY?.trim();
    if (!announced) { diagnostic(enabled ? "enabled" : env.LANGSMITH_TRACING === "true" ? "missing_api_key" : "disabled"); announced = true; }
    return enabled;
  }
  const sign = (payload: string) => createHmac("sha256", env.LANGSMITH_API_KEY ?? "")
    .update(`whats-left-trace-v1:${env.LANGSMITH_PROJECT ?? "whats-left"}:${payload}`).digest("base64url");
  const encode = (context: TraceContext) => { const payload = Buffer.from(JSON.stringify(context)).toString("base64url"); return `${payload}.${sign(payload)}`; };
  function decode(token: string | null): TraceContext | null {
    try {
      if (!token || token.length > 512) return null;
      const [payload, signature, extra] = token.split(".");
      if (!payload || !signature || extra) return null;
      const actual = Buffer.from(signature), expected = Buffer.from(sign(payload));
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      const value = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.id)
        || !Number.isSafeInteger(value.started) || value.started > Date.now() + 60_000 || Date.now() - value.started > 12 * 60 * 60 * 1000) return null;
      return { id: value.id, started: value.started };
    } catch { return null; }
  }
  async function sdk() {
    const { Client: SDKClient, RunTree: Tree } = await dependencies.sdk();
    const client = new SDKClient({ apiKey: env.LANGSMITH_API_KEY, apiUrl: env.LANGSMITH_ENDPOINT?.trim() || undefined,
      timeout_ms: 1500, callerOptions: { maxRetries: 0 }, autoBatchTracing: false,
      hideInputs: true, hideOutputs: true, omitTracedRuntimeInfo: true });
    return { client, Tree };
  }
  const rootFor = (Tree: typeof RunTree, client: Client, context: TraceContext) => new Tree({
    id: context.id, trace_id: context.id, start_time: context.started, name: "whats-left-analysis",
    run_type: "chain", project_name: env.LANGSMITH_PROJECT?.trim() || "whats-left", inputs: {}, client, tracingEnabled: true,
  });
  async function post(client: Client, tree: RunTree, metadata: Metadata, end?: number) {
    // Direct SDK client calls allow errors to be caught here, rather than the
    // RunTree convenience methods logging unrestricted transport exceptions.
    await client.createRun({ id: tree.id, name: tree.name, run_type: "chain", start_time: tree.start_time,
      end_time: end, trace_id: tree.trace_id, dotted_order: tree.dotted_order,
      parent_run_id: tree.parent_run?.id, project_name: env.LANGSMITH_PROJECT?.trim() || "whats-left",
      inputs: {}, outputs: {}, extra: { metadata }, error: metadata.outcome === "failed" || metadata.outcome === "rejected" ? "stage_failed" : undefined });
  }
  async function finish(client: Client, root: RunTree, context: TraceContext, status: "complete" | "failed" | "cancelled", end: number) {
    await client.updateRun(root.id, { trace_id: root.trace_id, dotted_order: root.dotted_order, end_time: end,
      outputs: {}, error: status === "complete" ? undefined : `analysis_${status}`,
      extra: { metadata: { outcome: status, latency_ms: Math.max(0, end - context.started) } } });
  }
  async function schedule(task: () => Promise<void>) {
    try { await dependencies.schedule(async () => { try { await task(); } catch { diagnostic("upload_failed"); } }); }
    catch { diagnostic("schedule_failed"); }
  }
  function traceStage<T>(stage: Stage, operation: () => T): T {
    const active = storage.getStore();
    if (!active) return operation();
    const event: Event = { stage, started: Date.now(), ended: 0, success: false };
    active.events.push(event);
    try {
      const result = operation();
      event.success = !(result && typeof result === "object" && "ok" in result && result.ok === false);
      return result;
    } finally { event.ended = Date.now(); }
  }
  function observeRoute(stage: Stage, model: string | undefined, handler: (request: Request) => Promise<Response>) {
    return async (request: Request): Promise<Response> => {
      if (!tracingEnabled()) return handler(request);
      let active: Active, fresh: boolean, standalone: boolean;
      try {
        const inherited = stage === "evidence-agent" ? null : decode(request.headers.get(TRACE_HEADER));
        fresh = !inherited; standalone = fresh && stage !== "evidence-agent";
        active = { context: inherited ?? { id: randomUUID(), started: Date.now() }, events: [] };
      } catch { return handler(request); }
      const event: Event = { stage, model, started: Date.now(), ended: 0, success: false };
      active.events.push(event);
      let response: Response | undefined;
      try { response = await storage.run(active, () => handler(request)); event.success = response.ok; return response; }
      finally {
        event.ended = Date.now();
        try {
          response?.headers.set(TRACE_HEADER, encode(active.context));
          const copy = response?.clone();
          // Registration and upload are best effort; neither gates the business response.
          void schedule(async () => {
            const metadata = await outcome(copy);
            const { client, Tree } = await sdk(), root = rootFor(Tree, client, active.context);
            if (fresh) await post(client, root, { stage: "analysis" });
            const routeSpan = root.createChild({ name: stage, start_time: event.started, inputs: {} });
            for (const child of active.events.slice(1)) {
              const tree = routeSpan.createChild({ name: child.stage, start_time: child.started, inputs: {} });
              await post(client, tree, { stage: child.stage, outcome: child.success ? "accepted" : "rejected",
                validation_result: child.success ? "passed" : "rejected", latency_ms: Math.max(0, child.ended - child.started) }, child.ended);
            }
            await post(client, routeSpan, { ...metadata, stage, ...(model ? { model } : {}), latency_ms: event.ended - event.started }, event.ended);
            if (standalone || !event.success || stage === "decision-agent") await finish(client, root, active.context, event.success ? "complete" : "failed", event.ended);
          });
        } catch { diagnostic("observation_failed"); }
      }
    };
  }
  async function completeTrace(token: string | null, status: "complete" | "failed" | "cancelled") {
    if (!tracingEnabled()) return;
    const context = decode(token); if (!context) return;
    const ended = Date.now();
    await schedule(async () => { const { client, Tree } = await sdk(); await finish(client, rootFor(Tree, client, context), context, status, ended); });
  }
  return { tracingEnabled, observeRoute, traceStage, completeTrace };
}
const observability = createObservability(process.env);
export const { tracingEnabled, observeRoute, traceStage, completeTrace } = observability;
