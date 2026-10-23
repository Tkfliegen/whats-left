import { URL } from "node:url";
import type { Evidence } from "@/types/evidence";
import type { LeakResult } from "@/types/leaks";

export type ReviewReason = "needs_more_data" | "low_confidence" | "evaluation" | "explicit_review";
export type ReviewInput = {
  analysisId: string; businessType: string | null; sourceSummary: string;
  evidence: Evidence; acceptedLeaks: LeakResult; scenarioStatus: "calculable" | "not_calculable_yet" | "not_simulation_ready" | "mixed";
  decisionStatus: "actionable" | "needs_more_data"; reviewReason: ReviewReason;
};
type Environment = Record<string, string | undefined>;
export function normalizeReviewPayload(input: ReviewInput, now = new Date()) {
  const analysisId = input.analysisId.trim();
  if (!analysisId || analysisId.length > 128 || !["needs_more_data", "low_confidence", "evaluation", "explicit_review"].includes(input.reviewReason)
    || !["calculable", "not_calculable_yet", "not_simulation_ready", "mixed"].includes(input.scenarioStatus)
    || !["actionable", "needs_more_data"].includes(input.decisionStatus)) throw new Error("Invalid review metadata.");
  // Explicit projection: no raw source_input, complete provenance, upstream
  // completion, reasoning, environment, transport headers or extra object keys.
  const e = input.evidence;
  const cited = new Set(input.acceptedLeaks.leaks.flatMap(f => f.evidence_refs));
  return {
    analysisId, businessType: input.businessType?.trim() || null, sourceSummary: input.sourceSummary.trim(),
    evidence: { business_type: e.business_type, period: e.period, currency: e.currency,
      revenue: { total: e.revenue.total, items: e.revenue.items.map(i => ({ name: i.name, amount: i.amount, source_text: i.source_text })) },
      costs: { total: e.costs.total, items: e.costs.items.map(i => ({ name: i.name, amount: i.amount, reported_category: i.reported_category, source_text: i.source_text })) },
      citable_facts: (e.provenance?.citable_facts ?? []).filter(f => cited.has(f.id)).map(f => ({ id: f.id, text: f.text })),
      facts: [...e.facts], missing_information: [...e.missing_information], confidence: e.confidence },
    acceptedLeaks: { leaks: input.acceptedLeaks.leaks.map(f => ({ title: f.title, category: f.category,
      evidence: [...f.evidence], evidence_refs: [...f.evidence_refs], intervention_ref: f.intervention_ref ?? null,
      interpretation: f.interpretation, confidence: f.confidence })),
      insufficient_evidence: input.acceptedLeaks.insufficient_evidence.map(i => ({ topic: i.topic, reason: i.reason })) },
    scenarioStatus: input.scenarioStatus, decisionStatus: input.decisionStatus, reviewReason: input.reviewReason,
    createdAt: now.toISOString(),
  };
}

// No production route imports this optional service. There is deliberately no
// submission/run/project/dataset creation method in this integration phase.
export function createTolokaService(env: Environment, fetcher: typeof fetch = fetch) {
  const enabled = () => env.TOLOKA_ENABLED === "true";
  async function getStatus() {
    if (!enabled()) return { status: "disabled" as const };
    if (!env.TOLOKA_API_KEY?.trim()) return { status: "not_configured" as const };
    let url: URL;
    try {
      const base = new URL(env.TOLOKA_BASE_URL?.trim() || "https://platform.toloka.ai");
      if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error();
      base.pathname = base.pathname.replace(/\/$/, "") + "/api/v2-beta/me"; url = base;
    } catch { return { status: "invalid_configuration" as const }; }
    try {
      const response = await fetcher(url.toString(), { method: "GET", headers: { Authorization: `ApiKey ${env.TOLOKA_API_KEY}` },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) return { status: "http_error" as const, httpStatus: response.status };
      const body = await response.json();
      if (!body || typeof body.id !== "string" || !Array.isArray(body.teams)) return { status: "invalid_response" as const };
      // Do not return account email, raw responses or team identifiers.
      return { status: "available" as const, teamCount: body.teams.length };
    } catch { return { status: "unavailable" as const }; }
  }
  function prepareReview(input: ReviewInput) {
    if (!enabled()) return { status: "disabled" as const, submitted: false as const };
    if (!env.TOLOKA_API_KEY?.trim()) return { status: "not_configured" as const, submitted: false as const };
    return { status: "prepared" as const, submitted: false as const, payload: normalizeReviewPayload(input),
      target: { projectId: env.TOLOKA_PROJECT_ID?.trim() || null, datasetId: env.TOLOKA_DATASET_ID?.trim() || null } };
  }
  return { enabled, getStatus, prepareReview };
}
const toloka = createTolokaService(process.env);
export const getTolokaStatus = toloka.getStatus;
export const prepareTolokaReview = toloka.prepareReview;
