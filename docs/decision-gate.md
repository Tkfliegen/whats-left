# Deterministic Decision Gate v1

`POST /api/analyze/decision-gate` accepts `DecisionGateRequest` and returns
`DecisionGateResponse` directly. Exact exported types are in
`src/types/decision-gate.ts`. The pure function is `evaluateDecisionGate` in
`src/lib/decision-gate.ts`. There is no model, external call, recommendation
prose, frontend connection or modification to upstream agent responsibilities.

## Input and trust boundary

```ts
type DecisionGateRequest = {
  evidence: Evidence;
  scenarios: ScenarioResult;
  simulation: { results: Array<GateCalculableResult | NotCalculableResult> };
};
```

The result types reuse the existing calculator contracts. `GateCalculableResult`
only widens `calculation.formula_id` to string so unknown future formula meanings
can explicitly return a non-action gate rather than silently gaining cost-
reduction semantics. Existing `SimulationResponse` values remain compatible.

The caller must supply validated/authorized Scenario output and verified
calculator output. This layer validates their structure and exact relationship;
it does not redo source authorization, parse Notes, recalculate financial
impacts, or authenticate business facts. Each scenario needs exactly one result,
joined by exact title and target leak, with identical controlled changes. No
fuzzy matching, missing results, extra results, duplicates or status repair.

Malformed requests return HTTP 400. The pure function throws TypeError for the
same malformed inputs. Non-finite numbers, negative impacts/costs, missing
monetary currency/period, unsupported structures and inconsistent result states
are rejected. Calculable results require nonempty traceable calculation inputs.

## Output

The exact types define:

- `decision_gate`: needs_more_data | action_allowed | no_actionable_scenario.
- `reason_codes`: machine-readable reasons, not recommendation prose.
- `comparison_gap_status`: below_threshold | meets_or_exceeds_threshold |
  not_applicable. No relative percentage is returned.
- `candidates`: every authorized scenario exactly once, with deterministic local
  ID, original title/target, status, verified impact, currency, period, and
  `impact_metric` (cost_reduction or null).
- `top_candidate_id`: numeric ordering metadata only, never an action instruction.
- `missing_decision_inputs`: exact upstream missing-input strings, deduplicated
  without rewriting.
- `policy_required_inputs`: enum-based policy context, separate from upstream
  missing_decision_inputs. See the contract below.
- `not_simulation_ready`: separate unchanged context, never ranked as candidates.

Candidate IDs follow scenario input order: candidate_01, candidate_02, etc.
They are stable for the same order and inside one response, not cross-run global
identifiers. Simulation array order does not affect joins or IDs. Equal impacts
keep input order as a display tie-break, but never permit an action.

## Gate rules

1. Zero authorized scenarios: no_actionable_scenario; no top or gap comparison.
2. Authorized scenarios but none calculable: needs_more_data; no top/gap.
3. Mixed calculable/not-calculable: needs_more_data; unresolved candidates cannot
   be assumed inferior. No top/gap is published.
4. All calculable: compare only matching currency and exact period strings,
   using explicit approved cost-reduction formula IDs. No FX, period scaling,
   prose interpretation or inferred metric equivalence. Unknown formula IDs
   return needs_more_data with unsupported_impact_metric.
5. Highest impact <= 0: needs_more_data; top null and gap not_applicable.
6. Exactly one positive calculable candidate and no unresolved competitors:
   action_allowed; gap not_applicable.
7. Two or more comparable positive-top candidates: descending verified impact
   determines top and runner-up. Below 10% gives needs_more_data; at or above
   10% gives action_allowed. A below-threshold top ID remains descriptive only.

The approved metric registry contains exactly LABOR_HEADCOUNT_DELTA and
INGREDIENT_WASTE_RATE_TARGET, both explicitly mapped to cost_reduction.

## Threshold precision

For positive top impact:

```
relativeGap = (topImpact - secondImpact) / topImpact
relativeGap < 0.10  -> below_threshold
relativeGap >= 0.10 -> meets_or_exceeds_threshold
```

No input rounding occurs. Implementation compares the mathematically equivalent
`10 * (top - second) >= top` with exact integers after scaling the supplied
numbers' canonical decimal representations. This avoids binary floating-point
boundary artifacts, including 0.30 versus 0.27, without an epsilon tolerance or
cent rounding. Scientific notation and sub-cent differences are preserved. The
ratio is not exposed to downstream models. Negative inputs are rejected; a zero
top is handled before division/comparison. No calculator result is changed.

## Missing information and blockers

For authorized candidates, missing_decision_inputs comes only from calculator
missing_inputs. Model Scenario missing-input prose and Evidence descriptions
are not converted into additional calculation or execution requirements. For
zero authorized candidates, explicit not_simulation_ready missing categories
populate the list. Separate non-ready context is always preserved.

Generic absence of implementation cost/risk is not an automatic veto. Current
upstream contracts have no structured blocking-condition field, so v1 supports
none and never infers blockers from prose. Unknown request properties, including
attempted blocking-condition extensions, are rejected rather than ignored.

## Policy-required inputs

`missing_decision_inputs` remains authoritative upstream missing data only. The
new `policy_required_inputs` field supplies policy-defined categories only:

```ts
type PolicyRequiredInput = {
  category: "implementation_cost" | "operational_constraints";
  reason_code: "CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT";
};
```

Only a needs_more_data gate with below_threshold comparison and the existing
close_call_below_threshold reason produces both categories, in the order above.
Each contains only the category and reason enum; no narrative examples, new
business consequences, or arbitrary model-facing prose. Existing gate reason
codes are unchanged; the uppercase code belongs to policy entries.

All other outcomes return an empty policy_required_inputs array: Cornhead's
missing calculation inputs, unresolved competitors, incompatible currency or
period, unsupported metric, zero top impact, action_allowed and no authorized
scenarios. The two missing-information fields are never merged. For example,
calculable 800 vs 770 returns empty upstream missing_decision_inputs but both
policy categories. Cornhead returns authoritative calculation omissions and no
policy categories.

`validatePolicyRequiredInputs(value, context)` checks the exact item structure,
allowlisted category/reason, unique categories, and complete two-category set
for the close-call context. Unknown values, missing fields, extra prose,
duplicates, incomplete close-call categories and entries in any other context
are rejected without repair. The Gate checks its generated field before
returning it. The API input contract is unchanged and accepts no external
policy-required-input override.

The future Decision Agent may collect these explicit categories when blocked
by the close-call policy. It must not expand operational_constraints into
unsupplied service, quality, production or other risk examples. Comparability
failures still explain themselves through reason codes without inventing
missing-data requests. Structured blocking conditions remain unsupported in v1.

## Verification fixtures

`tests/fixtures/decision-gate.json` contains Cornhead plus close, clear,
moderate, exact-boundary and just-below cases. Financial snapshots were generated
through the existing deterministic calculator with complete synthetic source
facts; no model supplied the arithmetic.

Expected gates: Cornhead needs_more_data; 800 vs 770 below threshold; 2500 vs
500 and 1100 vs 900 action_allowed; 1000 vs 900 action_allowed; 1000 vs 901
needs_more_data. Delivery remains separate. No recommendation is generated.
