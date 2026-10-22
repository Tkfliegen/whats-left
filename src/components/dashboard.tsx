"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useDemoAnalysis, type AnalysisStage } from "./use-demo-analysis";
import { AgentOffice } from "@/components/agent-office";
import Link from "next/link";
import type { LeakResult } from "@/types/leaks";
import { leakSummary } from "@/lib/leak-display";
import type { Evidence } from "@/types/evidence";
import { evidenceAmount } from "@/lib/evidence-display";
import { baselineBusinessSummary } from "@/lib/baseline-business-summary";
import { evidenceWaterfall } from "@/lib/evidence-waterfall";
import { useBackgroundRegions } from "./use-background-regions";

import { DecisionPanel } from "./decision-panel";
import type { DecisionResult } from "@/types/decision";
import { ScenarioPanel } from "./scenario-panel";
import type { ScenarioResponse } from "@/types/scenarios";
import type { SimulationResponse } from "@/types/scenario-calculator";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function Header() {
  return <header className="border-b border-[var(--border-default)]"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 sm:px-9 lg:px-12"><Link href="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-active)] bg-[var(--bg-card)] text-2xl text-[var(--accent-primary)]" aria-hidden="true">◔</span><div><p className="text-lg font-semibold tracking-tight">What’s Left<span>?</span></p><p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">See what your business really keeps.</p></div></Link><div className="flex items-center gap-4"><span className="hidden text-xs text-[var(--text-secondary)] sm:block">Your profitability workspace</span><span className="badge">EARLY PREVIEW</span></div></div></header>;
}

function BusinessInputPanel({ onAnalyze, complete, isRunning, analysisError }: { onAnalyze: (input: string, notes: string) => void; complete: boolean; isRunning: boolean; analysisError: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState("");
  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const names = Array.from(selected).filter(file => /\.(csv|pdf|xlsx|png|jpe?g|webp|gif)$/i.test(file.name)).map(file => file.name);
    setError(names.length !== selected.length ? "Please choose CSV, PDF, XLSX, or image files." : "");
    setFiles(current => [...new Set([...current, ...names])]);
  }
  return <section className="panel p-6" aria-labelledby="input-title"><div className="mb-5 flex items-center justify-between gap-2"><h2 id="input-title" className="text-lg font-medium">Business Input</h2><span className="font-mono text-[9px] text-[var(--text-muted)]">01 / START HERE</span></div>
    <form className="space-y-4" onSubmit={event => { event.preventDefault();
      if (isRunning) return;
      const data = new FormData(event.currentTarget);
      onAnalyze([`Business name: ${data.get("businessName")}`, `Selected business type: ${data.get("businessType")}`, `Business description / notes: ${data.get("notes")}`].join("\n"), String(data.get("notes") ?? "")); }}>
      <div className="grid gap-4 sm:grid-cols-[1.25fr_1fr]"><label className="field-label">Business name<input name="businessName" required defaultValue="The Daily Grind" placeholder="Your business name" /></label><label className="field-label">Business type<select name="businessType" defaultValue="Café">{["Café", "Bakery", "Tea Shop", "Restaurant", "Other"].map(type => <option key={type}>{type}</option>)}</select></label></div>
      <label className="field-label">Notes <span className="text-[var(--text-muted)]">(optional)</span><textarea name="notes" rows={2} placeholder="Anything we should know? Quiet Tuesdays, rising supplier costs…" /></label>
      <label className="upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }}><span className="text-xl text-[var(--accent-primary)]" aria-hidden="true">↥</span><span className="text-xs text-[var(--text-secondary)]">Drop your business files here, or <span className="text-[var(--accent-primary)]">browse</span></span><span className="text-[10px] text-[var(--text-muted)]">CSV, PDF, XLSX, images · Local selection only · Not analyzed</span><input className="sr-only" aria-label="Choose business files" type="file" multiple accept=".csv,.pdf,.xlsx,.png,.jpg,.jpeg,.webp,.gif" onChange={event => { addFiles(event.target.files); event.target.value = ""; }} /></label>
      {(error || analysisError) && <p role="alert" className="text-xs text-[var(--text-secondary)]">{analysisError || error}</p>}
      {analysisError && <p className="text-xs text-[var(--text-muted)]">Retry starts a fresh analysis. Your input stays in this form.</p>}
      <ul className="space-y-2" aria-label="Selected files">{files.map(name => <li key={name} className="flex items-center gap-2 text-xs"><span className="rounded border border-[var(--border-default)] px-1.5 py-1 font-mono text-[8px] text-[var(--text-secondary)]">{name.split(".").pop()?.toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{name}</span><button type="button" aria-label={`Remove ${name}`} onClick={() => setFiles(current => current.filter(file => file !== name))} className="px-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">×</button></li>)}</ul>
      <button type="submit" disabled={isRunning} aria-busy={isRunning} className="flex w-full items-center justify-center gap-3 rounded-lg analyze-button px-4 py-3 text-sm font-semibold transition">{isRunning ? "Analysis in progress…" : analysisError ? "Retry full analysis" : complete ? "Run Analysis Again" : "Analyze My Business"}<span aria-hidden="true">↗</span></button><p className="text-center text-[10px] text-[var(--text-muted)]">AI analysis with deterministic validation and calculations · Files are not processed.</p>
    </form></section>;
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
  return <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="waterfall-title"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="waterfall-title" className="text-sm font-medium">Where the money goes</h3><div className="flex gap-4 text-[10px] text-[var(--text-secondary)]"><span>● {evidence ? "Reported totals" : "Revenue & profit"}</span><span>▪ {evidence ? "What’s Left: deterministic baseline, not Scenario impact" : "Operating costs"}</span></div></div><div className="mt-7 overflow-x-auto pb-2" tabIndex={0} role="region" aria-label={evidence ? "Reported totals and deterministic baseline: scroll horizontally on small screens" : "Profit waterfall: scroll horizontally on small screens"}><div className="waterfall min-w-[720px]" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>{bars.map((bar, index) => <div key={`${index}-${bar.label}`}><div className="relative h-40 border-b border-[var(--border-default)]"><div className={`absolute inset-x-[17%] rounded-t-sm ${(bar.label === "Left" || bar.label === "What’s Left") ? "bg-[var(--accent-result-current)]/80" : "bg-[var(--text-muted)]/60"}`} style={{ height: `${Math.abs(bar.value ?? 0) / chart.range * 100}%`, bottom: `${percent(bar.bottom)}%` }} /><span className={`absolute inset-x-0 text-center font-mono text-[9px] ${(bar.label === "Left" || bar.label === "What’s Left") ? "text-[var(--accent-result-current)]" : bar.total ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`} style={{ bottom: `calc(${percent(bar.bottom + Math.abs(bar.value ?? 0))}% + 7px)` }}>{bar.total ? "" : (bar.value ?? 0) < 0 ? "+" : "−"}{evidence ? evidenceAmount(bar.value === null || bar.total ? bar.value : Math.abs(bar.value), evidence.currency) : money(bar.value ?? 0)}</span></div><p className="mt-3 text-center text-[9px] text-[var(--text-secondary)]">{bar.label}</p></div>)}</div></div></section>;
}

function ProfitLeaks({ visible, result }: { visible: boolean; result: LeakResult }) {
  const reducedMotion = useReducedMotion();
  return <section className="min-w-0" aria-labelledby="leaks-title"><div className="mb-4 flex flex-wrap items-center gap-2"><h3 id="leaks-title" className="text-base font-medium">{leakSummary(result)}</h3>{result.leaks.length > 0 && <span className="rounded bg-[var(--bg-card)] px-2 py-0.5 text-[9px] text-[var(--text-secondary)]">NEEDS ATTENTION</span>}</div><div className="space-y-3">{result.leaks.map((leak, index) => <motion.article initial={false} animate={{ opacity: visible ? 1 : 0, y: visible || reducedMotion ? 0 : 8 }} transition={{ duration: 0.35, delay: visible ? index * 0.12 : 0 }} key={`${index}-${leak.title}`} className="panel flex items-start gap-4 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-default)] text-lg text-[var(--text-secondary)]" aria-hidden="true">{leak.category === "labor" ? "◷" : leak.category === "delivery" ? "↗" : "◈"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-sm font-medium">{leak.title}</h4><p className="text-xs text-[var(--text-secondary)]">{leak.confidence} confidence</p></div><p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{leak.interpretation}</p><p className="mt-3 font-mono text-[8px] tracking-widest text-[var(--text-muted)]">{leak.category.toUpperCase()}</p></div></motion.article>)}</div>
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

function BusinessOutlook({ stage, runId, evidence, leakResult, scenarioResult, simulationResult, decisionResult, analysisError }: { stage: AnalysisStage; runId: number; evidence: Evidence | null; leakResult: LeakResult | null; scenarioResult: ScenarioResponse | null; simulationResult: SimulationResponse | null; decisionResult: DecisionResult | null; analysisError: string }) {
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
      <p>{analysisError ? evidence ? "Your completed results are preserved. Please try again." : "Your input is preserved. Please try again." : stage === "idle" ? "Add your business details and files, then run the analysis." : stage === "complete" ? "Your analysis and decision are ready." : "AI analysis with deterministic validation and scenario calculations."}</p>
    </div>
    <div key={runId}>
      <SummaryMetrics evidence={evidence} />
      {stage === "complete" && <ProfitWaterfall evidence={evidence} />}
      {leakResult && <div className="mt-7 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <ProfitLeaks visible={true} result={leakResult} />
        {scenario && <ScenarioPanel result={scenarioResult?.scenarios ?? null} simulation={simulationResult} failed={!!analysisError} />}
      </div>}
      {["decision", "complete"].includes(stage) && <DecisionPanel result={decisionResult} failed={!!analysisError} />}
    </div>
  </section>;
}

export function Dashboard() {
  const { workflow, stage, startAnalysis, evidenceResult, leakResult, scenarioResult, simulationResult, decisionGateResult, decisionResult, analysisError, isRunning } = useDemoAnalysis();
  useBackgroundRegions(stage, workflow.runId);
  return <><Header /><main className="mx-auto w-full max-w-[1440px] px-5 py-9 sm:px-9 lg:px-12"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">YOUR BUSINESS, UNDERSTOOD</p><h1 className="text-3xl font-medium tracking-tight sm:text-4xl">A clearer picture of what’s left.</h1><p className="mt-3 text-sm text-[var(--text-secondary)]">AI interprets business evidence. Code verifies scenarios and calculates impact. AI recommends within verified boundaries.</p></div><span className="badge"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />Analysis workspace</span></div><div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><AgentOffice key={workflow.runId} workflow={workflow} stage={stage} evidence={evidenceResult} leakResult={leakResult} scenarioResult={scenarioResult} simulationResult={simulationResult} decisionGateResult={decisionGateResult} decisionResult={decisionResult} analysisError={analysisError} /><BusinessInputPanel complete={stage === "complete"} onAnalyze={startAnalysis} isRunning={isRunning} analysisError={analysisError} /></div><BusinessOutlook stage={stage} runId={workflow.runId} evidence={evidenceResult} leakResult={leakResult} scenarioResult={scenarioResult} simulationResult={simulationResult} decisionResult={decisionResult} analysisError={analysisError} /><footer className="flex flex-wrap justify-between gap-3 border-t border-[var(--border-default)] py-6 text-xs text-[var(--text-muted)]"><span>What’s Left? · A little clarity goes a long way.</span><span>AI analysis with deterministic validation, scenario calculations, and bounded decision support.</span></footer></main></>;
}
