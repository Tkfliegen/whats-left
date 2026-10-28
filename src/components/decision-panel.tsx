"use client";

import { SectionIcon } from "./section-icon";
import type { DecisionResult } from "@/types/decision";
import { decisionInputLabel } from "@/lib/decision-display";
import { scenarioMoney } from "@/lib/scenario-display";
import type { AnalysisNotice } from "@/lib/analysis-status";

export function DecisionPanel({ result, failed = false, notice }: { result: DecisionResult | null; failed?: boolean; notice?: AnalysisNotice | null }) {
  const actionable = result?.decision_status === "actionable" && result.recommendation.type === "business_action";
  const approvedTestNeedsSupport = !actionable && notice?.category === "more_data_needed" && notice.staffing_test_approved === true;
  const priorityText = (item: DecisionResult["priority_inputs"][number]) => approvedTestNeedsSupport
    && item.source_type === "upstream_missing_input" && /^(?:an )?eligible authorized change$/i.test(item.key.trim())
    ? { label: "Supporting inputs for the approved staffing test", why: "Add the missing supporting evidence so the approved staffing test can be evaluated safely." }
    : { label: decisionInputLabel(item.key), why: item.why_it_matters };
  return <section className="panel mt-7 min-w-0 p-5 sm:p-6 [overflow-wrap:anywhere]" aria-labelledby="decision-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><SectionIcon section="decision" /><h3 id="decision-title" className="text-base font-medium">Decision</h3></div>
      {result && <span className="badge">{actionable ? "Actionable" : "Needs more data"}</span>}
    </div>
    {!result ? <p className="mt-3 text-xs text-[var(--text-secondary)]">{failed ? "Decision unavailable. Your earlier results are preserved. Please try again." : "Checking decision policy and preparing a grounded recommendation…"}</p> : <>
      <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
        {actionable ? <>
          <p className="text-xs text-[var(--accent-primary)]">Recommended next move</p>
          <h4 className="mt-2 text-lg font-medium">{result.recommendation.title}</h4>
        </> : <>
          <h4 className="text-lg font-medium text-[var(--accent-primary)]">More data needed before a confident decision</h4>
          <p className="mt-2 text-sm font-medium">{approvedTestNeedsSupport ? "Supporting inputs for the approved staffing test" : result.recommendation.title}</p>
        </>}
        <p className="mt-3 text-xs font-medium text-[var(--text-muted)]">Why</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{approvedTestNeedsSupport
          ? "The proposed staffing change is approved for testing, but more supporting evidence is required before it can be evaluated safely."
          : result.recommendation.rationale}</p>
      </div>
      {result.priority_inputs.length > 0 && <div className="mt-5">
        <h4 className="text-sm font-medium">Priority inputs</h4>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">{result.priority_inputs.map(item => <li key={`${item.source_type}:${item.key}`} className="min-w-0 rounded-xl border border-[var(--border-default)] p-4">
          <p className="text-[10px] text-[var(--text-muted)]">{item.source_type === "policy_required_input" ? "Decision context" : "Missing data"}</p>
          <p className="mt-1 text-sm font-medium">{priorityText(item).label}</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{priorityText(item).why}</p>
        </li>)}</ul>
      </div>}
      <h4 className="mt-5 text-sm font-medium">Scenario comparison</h4>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Decision comparison">
        {result.comparison.map((row, index) => <article key={row.candidate_id ?? `non-ready-${index}`} className="min-w-0 rounded-xl border border-[var(--border-default)] p-4">
          <h4 className="text-sm font-medium">{row.target_leak}</h4>
          {actionable && row.candidate_id !== null && row.candidate_id === result.recommendation.candidate_id && <p className="mt-2 text-xs text-[var(--accent-primary)]">Recommended candidate</p>}
          <p className="mt-3 text-xs text-[var(--text-secondary)]">{row.scenario_status === "calculable" ? "Verified impact" : row.scenario_status === "not_calculable_yet" ? "Scenario defined · Impact needs more data" : "Needs a controllable decision input"}</p>
          {row.scenario_status === "calculable" && row.verified_impact !== null && <p className="mt-1 text-xl tabular-nums text-[var(--accent-result-best)]">{row.currency ? scenarioMoney(row.verified_impact, row.currency) : row.verified_impact}</p>}
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{row.assessment}</p>
        </article>)}
      </div>

      <p className="mt-4 text-xs text-[var(--text-muted)]">{result.confidence} confidence in this conclusion</p>
    </>}
  </section>;
}
