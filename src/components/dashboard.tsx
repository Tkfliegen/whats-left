"use client";

import type { AnalysisNotice } from "@/lib/analysis-status";
import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useDemoAnalysis, type AnalysisStage } from "./use-demo-analysis";
import { AgentOffice } from "@/components/agent-office";
import Link from "next/link";
import Image from "next/image";
import brandLockup from "../../pic/what is left-hero.png";
import type { LeakResult } from "@/types/leaks";
import { leakSummary } from "@/lib/leak-display";
import type { Evidence } from "@/types/evidence";
import { evidenceAmount } from "@/lib/evidence-display";
import { baselineBusinessSummary } from "@/lib/baseline-business-summary";
import { evidenceWaterfall } from "@/lib/evidence-waterfall";
import { useBackgroundRegions } from "./use-background-regions";

import { BusinessInputPanel } from "./business-input-panel";

import { LeakCategoryIcon } from "./leak-category-icon";
import { DecisionPanel } from "./decision-panel";
import type { DecisionResult } from "@/types/decision";
import { ScenarioPanel } from "./scenario-panel";
import type { ScenarioResponse } from "@/types/scenarios";
import type { SimulationResponse } from "@/types/scenario-calculator";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function Header() {
  return <header className="hero-brand-header border-b border-[var(--border-default)]"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 sm:px-9 lg:px-12"><Link href="/" className="block w-[210px] shrink-0 sm:w-[320px]"><Image src={brandLockup} alt="What’s Left?" sizes="(min-width: 640px) 320px, 210px" className="h-auto w-full object-contain" /></Link><div className="flex items-center gap-4"><span className="hidden text-xs text-[var(--text-secondary)] sm:block">Your profitability workspace</span><span className="badge">EARLY PREVIEW</span></div></div></header>;
}

function SummaryMetrics({ evidence }: { evidence: Evidence | null }) {
  const snapshot = evidence !== null;
  const baseline = baselineBusinessSummary(evidence);
  const metrics = [
    { label: "Revenue", value: evidenceAmount(baseline.revenue, evidence?.currency ?? null), detail: "Reported whole-business total" },
    { label: "Operating Costs", value: evidenceAmount(baseline.operatingCosts, evidence?.currency ?? null), detail: "Reported whole-business total" },
    { label: "What’s Left", value: evidenceAmount(baseline.whatsLeft, evidence?.currency ?? null), detail: baseline.missing ?? "Deterministic baseline · Revenue − operating costs", featured: true },
    { label: "Margin", value: baseline.margin === null ? "—" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(baseline.margin)}%`, detail: baseline.marginUnavailable ?? "Deterministic baseline · What’s Left ÷ revenue" },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(metric => <div key={metric.label} className={`rounded-xl border p-5 ${metric.featured ? "border-[var(--border-active)] bg-[var(--bg-card)]" : "border-[var(--border-default)] bg-[var(--bg-card)]"}`}><p className={`text-xs ${metric.featured ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>{metric.label}{metric.featured && <span className="float-right" aria-hidden="true">✧</span>}</p><ResultReveal visible={snapshot} waiting="—"><p className={`mt-3 font-medium tracking-tight tabular-nums ${metric.featured ? "text-4xl text-[var(--accent-result-current)]" : "text-3xl text-[var(--text-primary)]"}`}>{metric.value}</p><p className="mt-2 text-[10px] text-[var(--text-muted)]">{metric.detail}</p></ResultReveal></div>)}</div>;
}

function ProfitWaterfall({ evidence }: { evidence: Evidence | null }) {
  const chart = evidenceWaterfall(evidence);
  const { bars } = chart;
  const percent = (value: number) => (value - chart.min) / chart.range * 100;
  return <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="waterfall-title"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="waterfall-title" className="text-sm font-medium">Where the money goes</h3><div className="flex gap-4 text-[10px] text-[var(--text-secondary)]"><span>● {evidence ? "Reported totals" : "Revenue & profit"}</span><span>▪ {evidence ? "What’s Left: deterministic baseline, not Scenario impact" : "Operating costs"}</span></div></div><div className="mt-7 overflow-x-auto pb-2" tabIndex={0} role="region" aria-label={evidence ? "Reported totals and deterministic baseline" : "Profit waterfall: scroll horizontally on small screens"}><div className={`waterfall ${evidence ? "w-full min-w-0" : "min-w-[720px]"}`} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>{bars.map((bar, index) => <div key={`${index}-${bar.label}`}><div className="relative h-30 border-b border-[var(--border-default)]"><div className={`absolute inset-x-[37%] rounded-t-sm ${(bar.label === "Left" || bar.label === "What’s Left") ? "bg-[var(--accent-result-current)]/80" : "bg-[var(--text-muted)]/60"}`} style={{ height: `${Math.abs(bar.value ?? 0) / chart.range * 100}%`, bottom: `${percent(bar.bottom)}%` }} /><span className={`absolute inset-x-0 text-center font-mono text-[9px] ${(bar.label === "Left" || bar.label === "What’s Left") ? "text-[var(--accent-result-current)]" : bar.total ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`} style={{ bottom: `calc(${percent(bar.bottom + Math.abs(bar.value ?? 0))}% + 7px)` }}>{bar.total ? "" : (bar.value ?? 0) < 0 ? "+" : "−"}{evidence ? evidenceAmount(bar.value === null || bar.total ? bar.value : Math.abs(bar.value), evidence.currency) : money(bar.value ?? 0)}</span></div><p className="mt-3 text-center text-[9px] text-[var(--text-secondary)]">{bar.label}</p></div>)}</div></div></section>;
}

function ProfitLeaks({ visible, result }: { visible: boolean; result: LeakResult }) {
  const reducedMotion = useReducedMotion();
  return <section className="min-w-0" aria-labelledby="leaks-title"><div className="mb-4 flex flex-wrap items-center gap-2"><h3 id="leaks-title" className="text-base font-medium">{leakSummary(result)}</h3>{result.leaks.length > 0 && <span className="rounded bg-[var(--bg-card)] px-2 py-0.5 text-[9px] text-[var(--text-secondary)]">NEEDS ATTENTION</span>}</div><div className="space-y-3">{result.leaks.map((leak, index) => <motion.article initial={false} animate={{ opacity: visible ? 1 : 0, y: visible || reducedMotion ? 0 : 8 }} transition={{ duration: 0.35, delay: visible ? index * 0.12 : 0 }} key={`${index}-${leak.title}`} className="panel flex items-start gap-4 p-4"><LeakCategoryIcon category={leak.category} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-sm font-medium">{leak.title}</h4><p className="text-xs text-[var(--text-secondary)]">{leak.confidence} confidence</p></div><p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{leak.interpretation}</p><p className="mt-3 font-mono text-[8px] tracking-widest text-[var(--text-muted)]">{leak.category.toUpperCase()}</p></div></motion.article>)}</div>
    {result.leaks.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No supported leaks were identified from the supplied evidence.</p>}
    {result.insufficient_evidence.length > 0 && <details className="mt-4 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">Needs more data ({result.insufficient_evidence.length})</summary><ul className="mt-3 space-y-3">{result.insufficient_evidence.map((item, index) => <li key={`${index}-${item.topic}`}><p className="font-medium">{item.topic}</p><p className="mt-1 leading-relaxed">{item.reason}</p></li>)}</ul></details>}
  </section>;
}

function ResultReveal({ visible, waiting, children }: { visible: boolean; waiting: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return <div style={{ position: "relative", minWidth: 0 }}>
    {!visible && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-[var(--text-muted)]">{waiting}</div>}
    <motion.div
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible || reducedMotion ? 0 : 10 }}
      transition={{ duration: 0.4 }}
      style={{ visibility: visible ? "visible" : "hidden" }}
    >{children}</motion.div>
  </div>;
}

function BusinessOutlook({ stage, runId, evidence, leakResult, scenarioResult, simulationResult, decisionResult, analysisError, source, notice }: { notice?: AnalysisNotice | null; source: string; stage: AnalysisStage; runId: number; evidence: Evidence | null; leakResult: LeakResult | null; scenarioResult: ScenarioResponse | null; simulationResult: SimulationResponse | null; decisionResult: DecisionResult | null; analysisError: string }) {
  const scenario = ["scenario", "decision", "complete"].includes(stage);
  const labels: Record<AnalysisStage, string> = {
    idle: "Ready to analyze", evidence: "Analyzing your business… · Reconstructing the operating picture…",
    leaks: leakResult ? `Analyzing your business… · ${leakSummary(leakResult)}` : "Analyzing your business… · Reviewing potential leaks…", scenario: "Analyzing your business… · Testing possible changes…",
    decision: "Analyzing your business… · Preparing your decision", complete: "Analysis complete",
  };
  return <section className="py-9" aria-labelledby="outlook-title">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 id="outlook-title" className="text-xl font-medium tracking-tight">Business Outlook</h2><span className="badge">Business analysis</span></div><span className="text-xs text-[var(--text-muted)]">{evidence ? [evidence.period, evidence.currency].filter(Boolean).join(" · ") || "Period / currency not reported" : "Period / currency pending"}</span></div>
    <div className="mb-4 min-h-12 text-xs leading-6 text-[var(--text-secondary)]" role="status" aria-live="polite" aria-atomic="true">
      <p className="text-[var(--text-primary)]">{analysisError ? "Analysis stopped" : labels[stage]}</p>
      <p>{analysisError ? evidence ? "Your completed results are preserved. See the status guidance above before continuing." : "Your input is preserved. See the status guidance above before continuing." : stage === "idle" ? "Add your business details and files, then run the analysis." : stage === "complete" ? "Your analysis and decision are ready." : "AI analysis with deterministic validation and scenario calculations."}</p>
    </div>
    {source && <p className="mb-4 text-xs text-[var(--text-secondary)]">Source: {source}</p>}
    <div key={runId}>
      <SummaryMetrics evidence={evidence} />
      {stage === "complete" && <ProfitWaterfall evidence={evidence} />}
      {leakResult && <div className="mt-7 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <ProfitLeaks visible={true} result={leakResult} />
        {scenario && <ScenarioPanel result={scenarioResult?.scenarios ?? null} simulation={simulationResult} failed={!!analysisError} />}
      </div>}
      {["decision", "complete"].includes(stage) && <DecisionPanel result={decisionResult} failed={!!analysisError} notice={notice} />}
    </div>
  </section>;
}

export function Dashboard() {
  const [source, setSource] = useState("");
  const { workflow, stage, startAnalysis, evidenceResult, leakResult, scenarioResult, simulationResult, decisionGateResult, decisionResult, analysisError, analysisStatus, isRunning } = useDemoAnalysis();
  useBackgroundRegions(stage, workflow.runId);
  return <><Header /><main className="mx-auto w-full max-w-[1440px] px-5 py-9 sm:px-9 lg:px-12"><div className="hero-intro mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-medium tracking-tight sm:text-4xl">A clearer picture of what’s left.</h1><p className="hero-supporting-copy mt-3 text-sm">Turn business evidence into verified, grounded decisions.</p></div><span className="badge"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />Analysis workspace</span></div><div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><AgentOffice key={workflow.runId} workflow={workflow} stage={stage} evidence={evidenceResult} leakResult={leakResult} scenarioResult={scenarioResult} simulationResult={simulationResult} decisionGateResult={decisionGateResult} decisionResult={decisionResult} analysisError={analysisError} notice={analysisStatus} /><BusinessInputPanel onSource={setSource} complete={stage === "complete"} onAnalyze={startAnalysis} isRunning={isRunning} analysisError={analysisError} retryable={analysisStatus?.category === "temporary_failure"} failureHeading={analysisStatus?.heading} /></div><BusinessOutlook source={source} stage={stage} runId={workflow.runId} evidence={evidenceResult} leakResult={leakResult} scenarioResult={scenarioResult} simulationResult={simulationResult} decisionResult={decisionResult} analysisError={analysisError} notice={analysisStatus} /><footer className="flex flex-wrap justify-between gap-3 border-t border-[var(--border-default)] py-6 text-xs text-[var(--text-muted)]"><span>What’s Left? · A little clarity goes a long way.</span><span>AI analysis with deterministic validation, scenario calculations, and bounded decision support.</span></footer></main></>;
}
