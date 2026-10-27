"use client";

import { useEffect, useRef, useState } from "react";
import { createAnalysisTrace } from "@/lib/observability/client";

import type { Evidence } from "@/types/evidence";
import type { LeakResponse, LeakResult } from "@/types/leaks";
import { operationalContext, usesReportedNumbers, unreportedNumberDiagnostic } from "@/lib/leak-display";

import type { ScenarioResponse } from "@/types/scenarios";
import type { DecisionGateResponse } from "@/types/decision-gate";
import type { DecisionResult } from "@/types/decision";
import { isDecisionGateResponse, isDecisionResponse } from "@/lib/decision-display";
import type { SimulationResponse } from "@/types/scenario-calculator";
import { isScenarioResponse, isSimulationResponse } from "@/lib/scenario-display";

export const HANDOFF_MS = 1150;
export type AnalysisStage = "idle" | "evidence" | "leaks" | "scenario" | "decision" | "complete";
export type Workflow = {
  index: number;
  phase: "idle" | "working" | "handoff" | "pause";
  runId: number;
  started: boolean;
  complete: boolean;
};
const stages = ["evidence", "leaks", "scenario", "decision"] as const;

export function useDemoAnalysis() {
  const [workflow, setWorkflow] = useState<Workflow>({ index: 0, phase: "idle", runId: 0, started: false, complete: false });

  const [evidenceResult, setEvidenceResult] = useState<Evidence | null>(null);
  const [leakResult, setLeakResult] = useState<LeakResult | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResponse | null>(null);
  const [decisionGateResult, setDecisionGateResult] = useState<DecisionGateResponse | null>(null);
  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const running = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => { request.current?.abort(); }, []);

  useEffect(() => {
    if (workflow.complete) running.current = false;
    if (!workflow.started || workflow.complete || workflow.phase === "idle") return;
    // Every stage, including Decision completion, is owned by its requests.
  }, [workflow]);

  const stage: AnalysisStage = !workflow.started ? "idle" : workflow.complete ? "complete" : stages[workflow.index];
  const startAnalysis = async (input: string, notes = "") => {
    if (running.current) return;
    running.current = true;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setEvidenceResult(null);
    setLeakResult(null);
    setScenarioResult(null);
    setSimulationResult(null);
    setDecisionGateResult(null);
    setDecisionResult(null);
    setAnalysisError("");
    setWorkflow(current => ({ index: 0, phase: "working", runId: current.runId + 1, started: true, complete: false }));
    const tracing = createAnalysisTrace();
    let completed = false;
    let failedStage: "Evidence" | "Leak" | "Scenario" | "Scenario calculation" | "Decision Gate" | "Decision" = "Evidence";
    let failureStatus: number | null = null;
    const handoff = () => new Promise<void>((resolve, reject) => {
      const abort = () => { window.clearTimeout(timer); reject(new Error("Run cancelled")); };
      const timer = window.setTimeout(() => {
        controller.signal.removeEventListener("abort", abort);
        resolve();
      }, HANDOFF_MS);
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const response = await fetch("/api/analyze/evidence", {
        method: "POST",
        headers: tracing.headers(),
        body: JSON.stringify({ input }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      tracing.observe(response);
      if (!response.ok) throw new Error("Evidence request failed");
      const result: { evidence?: Evidence } = await response.json();
      const evidence = result?.evidence;
      // The server validates the full schema; check the envelope before using it.
      if (!evidence || !evidence.revenue || !evidence.costs
        || !Array.isArray(evidence.revenue.items) || !Array.isArray(evidence.costs.items)
        || ![evidence.revenue.total, evidence.costs.total].every(value => value === null || (typeof value === "number" && Number.isFinite(value)))) {
        throw new Error("Invalid evidence response");
      }
      if (controller.signal.aborted || request.current !== controller) return;
      setEvidenceResult(evidence);
      setWorkflow(current => ({ ...current, phase: "handoff" }));
      await handoff();
      if (controller.signal.aborted || request.current !== controller) return;
      failedStage = "Leak";
      setWorkflow(current => ({ ...current, index: 1, phase: "working" }));
      const leakResponse = await fetch("/api/analyze/leaks", {
        method: "POST",
        headers: tracing.headers(),
        body: JSON.stringify({ evidence, operational_context: operationalContext(notes) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      if (!leakResponse.ok) throw new Error("Leak request failed");
      const leakBody: Partial<LeakResponse> = await leakResponse.json();
      const findings = leakBody?.leaks;
      if (!findings || !Array.isArray(findings.leaks) || !Array.isArray(findings.insufficient_evidence)) {
        throw new Error("Invalid leak response");
      }
      const numericContext = JSON.stringify({ input, evidence, notes },
        (key, value) => key === "provenance" ? undefined : value);
      if (!usesReportedNumbers(findings, numericContext)) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[What's Left?] Frontend Leak rejection", JSON.stringify(unreportedNumberDiagnostic(findings, numericContext)));
        }
        throw new Error("Unreported numbers in leak response");
      }
      if (controller.signal.aborted || request.current !== controller) return;
      setLeakResult(findings);
      setWorkflow(current => ({ ...current, phase: "handoff" }));
      await handoff();
      if (controller.signal.aborted || request.current !== controller) return;
      failedStage = "Scenario";
      setWorkflow(current => ({ ...current, index: 2, phase: "working" }));
      const scenarioResponse = await fetch("/api/analyze/scenarios", {
        method: "POST", headers: tracing.headers(),
        body: JSON.stringify({ evidence, leaks: findings, operational_context: operationalContext(notes) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      if (!scenarioResponse.ok) { failureStatus = scenarioResponse.status; throw new Error("Scenario request failed"); }
      const scenarioBody: unknown = await scenarioResponse.json();
      if (!isScenarioResponse(scenarioBody)) throw new Error("Invalid scenario response");
      if (controller.signal.aborted || request.current !== controller) return;
      setScenarioResult(scenarioBody);
      failedStage = "Scenario calculation";
      const simulationResponse = await fetch("/api/analyze/simulate", {
        method: "POST", headers: tracing.headers(),
        body: JSON.stringify({ evidence, scenarios: scenarioBody.scenarios, input_facts: scenarioBody.input_facts }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      if (!simulationResponse.ok) { failureStatus = simulationResponse.status; throw new Error("Simulation request failed"); }
      const simulationBody: unknown = await simulationResponse.json();
      if (!isSimulationResponse(simulationBody, scenarioBody.scenarios)) throw new Error("Invalid simulation response");
      if (controller.signal.aborted || request.current !== controller) return;
      setSimulationResult(simulationBody);
      setWorkflow(current => ({ ...current, phase: "handoff" }));
      await handoff();
      if (controller.signal.aborted || request.current !== controller) return;
      failedStage = "Decision Gate";
      setWorkflow(current => ({ ...current, index: 3, phase: "working" }));
      const gateResponse = await fetch("/api/analyze/decision-gate", {
        method: "POST", headers: tracing.headers(),
        body: JSON.stringify({ evidence, scenarios: scenarioBody.scenarios, simulation: simulationBody }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      if (!gateResponse.ok) { failureStatus = gateResponse.status; throw new Error("Decision Gate request failed"); }
      const gateBody: unknown = await gateResponse.json();
      if (!isDecisionGateResponse(gateBody)) throw new Error("Invalid Decision Gate response");
      if (controller.signal.aborted || request.current !== controller) return;
      setDecisionGateResult(gateBody);
      failedStage = "Decision";
      const decisionResponse = await fetch("/api/analyze/decision", {
        method: "POST", headers: tracing.headers(),
        // Pass through the exact stored Gate object; never rebuild its provenance.
        body: JSON.stringify({ evidence, leaks: findings, scenarios: scenarioBody.scenarios,
          simulation: simulationBody, decision_gate: gateBody }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      if (!decisionResponse.ok) { failureStatus = decisionResponse.status; throw new Error("Decision request failed"); }
      const decisionBody: unknown = await decisionResponse.json();
      if (!isDecisionResponse(decisionBody)) throw new Error("Invalid Decision response");
      if (controller.signal.aborted || request.current !== controller) return;
      setDecisionResult(decisionBody.decision);
      setWorkflow(current => ({ ...current, phase: "pause", complete: true }));
      completed = true;
      return true; // UI lifecycle signal; only a genuine Decision success clears the form.
    } catch {
      if (controller.signal.aborted || request.current !== controller) return;
      running.current = false;
      setAnalysisError(`${failedStage} analysis couldn't be completed${failureStatus ? ` (HTTP ${failureStatus})` : ""}. Please try again.`);
      setWorkflow(current => ({ ...current, index: failedStage === "Evidence" ? 0 : failedStage === "Leak" ? 1 : failedStage.startsWith("Decision") ? 3 : 2, phase: "idle", started: failedStage !== "Evidence", complete: false }));
    } finally {
      tracing.finish(controller.signal.aborted ? "cancelled" : completed ? "complete" : "failed");
    }
  };
  const isRunning = workflow.started && !workflow.complete && workflow.phase !== "idle";
  return { workflow, stage, startAnalysis, evidenceResult, leakResult, scenarioResult, simulationResult, decisionGateResult, decisionResult, analysisError, isRunning };
}
