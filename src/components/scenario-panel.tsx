"use client";

import type { ScenarioResult } from "@/types/scenarios";
import type { SimulationResponse } from "@/types/scenario-calculator";
import { controlledChangeLabel, scenarioMoney, simulationFor } from "@/lib/scenario-display";

export function ScenarioPanel({ result, simulation, failed = false }: {
  result: ScenarioResult | null; simulation: SimulationResponse | null; failed?: boolean;
}) {
  return <section className="panel min-w-0 flex flex-col [overflow-wrap:anywhere] border-[var(--border-default)] p-6" aria-labelledby="scenario-title">
    <div className="flex justify-between"><h3 id="scenario-title" className="text-base font-medium">Scenarios to test</h3><span className="text-[var(--agent-scenario)]" aria-hidden="true">✧</span></div>
    {!result && <p className="mt-2 text-xs text-[var(--text-secondary)]">{failed ? "Scenario results unavailable. Please try again." : "Defining supported changes…"}</p>}
    {result && <>
      <div className="mt-4 space-y-3">{result.scenarios.map((scenario, index) => {
        const calculated = simulationFor(scenario, simulation);
        return <article key={`${index}-${scenario.target_leak}`} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4" aria-label={scenario.title}>
          <h4 className="text-sm font-medium">{scenario.title}</h4>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">{scenario.target_leak}</p>
          <ul className="mt-3 space-y-2">{scenario.controlled_changes.map((change, changeIndex) => <li key={changeIndex} className="text-xs text-[var(--text-secondary)]"><span>{change.variable}</span><span className="ml-2 text-[var(--accent-primary)]">{controlledChangeLabel(change)}</span></li>)}</ul>
          <p className="mt-3 text-[10px] text-[var(--text-muted)]">{scenario.confidence} confidence</p>
          <div className="mt-4 border-t border-[var(--border-default)] pt-3">
            {calculated?.status === "calculable" ? <>
              <p className="text-xs text-[var(--text-secondary)]">Cost reduction</p>
              <p className="mt-1 text-xl text-[var(--accent-result-best)]">{scenarioMoney(calculated.calculation.impact_value, calculated.calculation.currency)}</p>
              <dl className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
                <div><dt>Baseline cost</dt><dd>{scenarioMoney(calculated.calculation.baseline_value, calculated.calculation.currency)}</dd></div>
                <div><dt>Projected cost</dt><dd>{scenarioMoney(calculated.calculation.projected_value, calculated.calculation.currency)}</dd></div>
              </dl>
              <p className="mt-3 text-[10px] text-[var(--text-muted)]">{calculated.calculation.currency} · {calculated.calculation.period} · Deterministic calculation</p>
            </> : calculated?.status === "not_calculable_yet" ? <>
              <p className="text-xs text-[var(--text-secondary)]">Scenario defined · Impact needs more data</p>
              <ul className="mt-2 space-y-2 text-[10px] leading-relaxed text-[var(--text-muted)]" aria-label="Missing calculation inputs">{calculated.missing_inputs.map((input, i) => <li key={i}>{input}</li>)}</ul>
            </> : <p className="text-xs text-[var(--text-secondary)]">{failed || simulation ? "Calculation result unavailable." : "Calculating impact…"}</p>}
          </div>
        </article>;
      })}</div>
      {result.scenarios.length === 0 && <p className="mt-3 text-xs text-[var(--text-secondary)]">No supported testable changes were identified.</p>}
      {result.not_simulation_ready.length > 0 && <details className="mt-4 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">Needs a controllable decision input ({result.not_simulation_ready.length})</summary><ul className="mt-3 space-y-3">{result.not_simulation_ready.map((item, index) => <li key={`${index}-${item.target_leak}`}><p className="font-medium">{item.target_leak}</p><p className="mt-1 leading-relaxed">{item.reason}</p><ul className="mt-2 space-y-1 text-[10px] text-[var(--text-muted)]">{item.missing_decision_input_categories.map((category, i) => <li key={i}>{category}</li>)}</ul></li>)}</ul></details>}
    </>}
  </section>;
}
