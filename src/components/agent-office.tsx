"use client";

import type { DecisionGateResponse } from "@/types/decision-gate";
import type { DecisionResult } from "@/types/decision";
import type { ScenarioResponse } from "@/types/scenarios";
import type { SimulationResponse } from "@/types/scenario-calculator";
import Image from "next/image";
import type { LeakResult } from "@/types/leaks";
import { leakSummary } from "@/lib/leak-display";
import type { Evidence } from "@/types/evidence";
import { evidenceSummary } from "@/lib/evidence-display";
import { HANDOFF_MS, type Workflow, type AnalysisStage } from "./use-demo-analysis";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Percentages refer to the full 1672 × 941 scene; left/top locate each
// image’s top-left corner. Keep positioning inline so overlays never enter flow.
const agents = [
  { name: "Evidence Agent", asset: "evidence-agent.png", left: "11.5%", top: "51%", width: "19%", depth: 2, glow: "var(--agent-evidence)" },
  { name: "Leak Detective", asset: "leak-detective.png", left: "69.5%", top: "51%", width: "19%", depth: 2, glow: "var(--agent-leak)" },
  { name: "Scenario Agent", asset: "scenario-agent.png", left: "19.75%", top: "27%", width: "12.5%", depth: 1, glow: "var(--agent-scenario)" },
  { name: "Decision Agent", asset: "decision-agent.png", left: "67.75%", top: "27%", width: "12.5%", depth: 1, glow: "var(--agent-decision)" },
];

const statusContent: Record<AnalysisStage, { title: string; subtitle: string; result?: string; accent: string }> = {
  idle: {
    title: "Ready to analyze.",
    subtitle: "Add your business details and files, then run the analysis.",
    accent: "var(--agent-evidence)",
  },
  evidence: {
    title: "Evidence Agent is reviewing the inputs.",
    subtitle: "Organizing files, notes, and operational evidence.",
    accent: "var(--agent-evidence)",
  },
  leaks: {
    title: "Leak Detective is on it.",
    subtitle: "Connecting the dots between sales, costs, and everyday operations.",
    accent: "var(--agent-leak)",
  },
  scenario: {
    title: "Scenario Agent is testing options.",
    subtitle: "Defining supported changes and checking calculation inputs.",
    accent: "var(--agent-scenario)",
  },
  decision: {
    title: "Decision Agent is reviewing the results.",
    subtitle: "Checking decision policy before preparing a recommendation.",
    accent: "var(--agent-decision)",
  },
  complete: {
    title: "Analysis complete.",
    subtitle: "Your evidence, scenarios and decision are ready.",
    result: "AI analysis · Deterministic validation",
    accent: "var(--agent-decision)",
  },
};

// Scene-relative packet anchors sit alongside the mascots, clear of their faces.
const handoffPoints = [
  { x: 33, y: 71 }, { x: 67, y: 71 },
  { x: 35, y: 43 }, { x: 65, y: 43 },
];

function HandoffDocument({ from, reducedMotion }: { from: number; reducedMotion: boolean }) {
  const start = handoffPoints[from];
  const end = handoffPoints[from + 1];
  const destination = reducedMotion ? start : end;
  return (
    <motion.div
      aria-hidden="true"
      initial={{ left: `${start.x}%`, top: `${start.y}%`, opacity: 0 }}
      animate={{
        left: [`${start.x}%`, `${(start.x + destination.x) / 2}%`, `${destination.x}%`],
        top: [`${start.y}%`, `${(start.y + destination.y) / 2 - (reducedMotion ? 0 : 5)}%`, `${destination.y}%`],
        opacity: [0, 1, 1, 0],
      }}
      transition={{ duration: HANDOFF_MS / 1000, ease: "easeInOut" }}
      style={{ position: "absolute", zIndex: 4, width: "2.4%", aspectRatio: "3 / 4", transform: "translate(-50%, -50%)", border: "1px solid #d6f4ff", borderRadius: "15%", background: "#d5f3ff", boxShadow: "0 0 12px #b9edffc0", padding: "0.4%", pointerEvents: "none" }}
    >
      {[0, 1, 2].map(line => <span key={line} style={{ display: "block", height: "12%", marginBottom: "18%", width: line === 2 ? "60%" : "100%", background: "#507c97", borderRadius: 1 }} />)}
    </motion.div>
  );
}

export function AgentOffice({ workflow, stage, evidence, leakResult, scenarioResult, simulationResult, decisionGateResult, decisionResult, analysisError }: { workflow: Workflow; stage: AnalysisStage; evidence: Evidence | null; leakResult: LeakResult | null; scenarioResult: ScenarioResponse | null; simulationResult: SimulationResponse | null; decisionGateResult: DecisionGateResponse | null; decisionResult: DecisionResult | null; analysisError: string }) {
  const reducedMotion = useReducedMotion() ?? false;
  const { index: active, phase } = workflow;
  const status = analysisError
    ? { ...statusContent[stage], title: "Analysis stopped.", subtitle: analysisError, result: undefined }
    : stage === "evidence"
    ? { ...statusContent.evidence, result: evidence ? evidenceSummary(evidence) : undefined }
    : stage === "leaks"
      ? { ...statusContent.leaks, result: leakResult ? leakSummary(leakResult) : undefined }
      : stage === "scenario"
        ? { ...statusContent.scenario, subtitle: simulationResult ? "Scenario analysis is ready." : scenarioResult ? "Calculating impacts from authoritative inputs." : "Defining supported measurable changes.", result: simulationResult ? `${scenarioResult?.scenarios.scenarios.length ?? 0} scenarios evaluated` : undefined }
        : stage === "decision"
          ? { ...statusContent.decision, subtitle: decisionGateResult ? "Preparing a grounded recommendation from the verified decision gate." : "Checking decision policy against verified scenario results." }
          : stage === "complete" && decisionResult
            ? { ...statusContent.complete, result: decisionResult.decision_status === "actionable" ? "Action recommendation ready" : "More data needed before a confident decision" }
            : statusContent[stage];

  return (
    <section className="panel flex min-w-0 flex-col overflow-hidden" aria-labelledby="office-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <div>
          <p className="eyebrow mb-2">FOUR SPECIALISTS. ONE CLEAR ANSWER.</p>
          <h2 id="office-title" className="text-lg font-medium">Agent Office</h2>
        </div>
        <span className="badge"><span className="h-1.5 w-1.5 rounded-full bg-[var(--agent-leak)]" />{phase === "idle" ? workflow.started ? "Analysis stopped" : "Ready to analyze" : phase === "pause" ? "Analysis complete" : phase === "handoff" ? "Task complete · Handoff" : "Team at work"}</span>
      </div>

      <div className="mx-4 mt-6 flex flex-1 items-center sm:mx-6">
        <div style={{ position: "relative", isolation: "isolate", width: "100%", aspectRatio: "1672 / 941", overflow: "hidden", borderRadius: 12 }}>
          <Image
            src="/agent-office/office-background.png"
            alt="Futuristic operations office with four workstations around a central holographic hub"
            width={1672}
            height={941}
            sizes="(min-width: 1440px) 708px, (min-width: 1024px) 54vw, 100vw"
            style={{ display: "block", width: "100%", height: "auto" }}
          />
          {agents.map((agent, index) => {
            const isActive = index === active && phase === "working";
            return (
              <div key={agent.asset} style={{ position: "absolute", left: agent.left, top: agent.top, width: agent.width, zIndex: agent.depth }}>
                <motion.div
                  key={isActive ? "active" : "idle"}
                  initial={{ scale: 1, y: 0 }}
                  animate={{
                    scale: reducedMotion ? 1 : isActive ? [1, 1.08, 1.04] : 1,
                    y: reducedMotion ? 0 : isActive ? [0, -12, -2] : 0,
                  }}
                  transition={{
                    duration: 0.45, ease: "easeOut",
                  }}
                  style={{ position: "relative", transformOrigin: "50% 90%" }}
                >
                  {/* The activation pop runs once; this nested layer floats afterward. */}
                  <motion.div
                    initial={{ y: 0, scale: 1 }}
                    animate={{
                      y: !reducedMotion && isActive ? [0, -10, 0] : 0,
                      scale: !reducedMotion && isActive ? [1, 1.025, 1] : 1,
                    }}
                    transition={{ delay: isActive ? 0.45 : 0, duration: 2.4, repeat: !reducedMotion && isActive ? Infinity : 0, ease: "easeInOut" }}
                    style={{ position: "relative", transformOrigin: "50% 90%" }}
                  >
                  <motion.div aria-hidden="true" animate={{ opacity: isActive ? 0.9 : 0.1 }} transition={{ duration: 0.4 }} style={{ position: "absolute", inset: "6%", borderRadius: "50%", background: `radial-gradient(ellipse, color-mix(in srgb, ${agent.glow} 50%, transparent), color-mix(in srgb, ${agent.glow} 19%, transparent) 45%, transparent 70%)`, pointerEvents: "none" }} />
                  <Image
                    src={`/agent-office/${agent.asset}`}
                    alt={`${agent.name}: ${isActive ? "active" : analysisError && index === active ? "stopped" : workflow.started && (index < active || (index === active && phase !== "working")) ? "completed" : "idle"}`}
                    width={1254}
                    height={1254}
                    sizes="(min-width: 1024px) 11vw, 19vw"
                    style={{ position: "relative", display: "block", width: "100%", height: "auto", filter: `drop-shadow(0 0 ${isActive ? 5 : 1}px color-mix(in srgb, ${agent.glow} ${isActive ? "63%" : "21%"}, transparent))` }}
                  />
                  </motion.div>
                </motion.div>
              </div>
            );
          })}
          {phase === "handoff" && <HandoffDocument key={active} from={active} reducedMotion={reducedMotion} />}

        </div>
      </div>

      <div className="m-6 flex gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] p-3">
        <span className="shrink-0 text-[var(--accent-primary)]" aria-hidden="true">✧</span>
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--text-secondary)]" role="status" aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-[var(--text-primary)]">{status.title}</p>
              <p>{status.subtitle}</p>
              <div className="mt-1.5 min-h-[1.125rem]">
                {status.result && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.15 }}
                    className="font-medium"
                    style={{ color: status.accent }}
                  >{status.result}</motion.p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
