# Scenario change authorization

The Scenario route validates model output in two separate steps:

1. Existing strict structure, finite numeric semantics, input references,
   confirmed-leak coverage and duplicate-destination validation.
2. `validateScenarioSupport`: every controlled change must match a server-built
   `ScenarioAuthorization` for that exact confirmed leak, and every required
   permission reference must appear in `available_input_refs`.

No invalid output is repaired. Rejections return HTTP 502 with a safe semantic
reason code; the model's rejected findings are not returned or logged. No retries
are performed in production. Neither the response schema nor frontend contract
changes. The calculator retains its separate readiness/arithmetic responsibility.

## Exact representation

```ts
type ScenarioVariableId = "tuesday_evening_headcount" | "ingredient_waste_rate";
type ScenarioAuthorization = {
  target_leak: string;
  variable_id: ScenarioVariableId;
  variable_label: string;
  change_type: "delta" | "absolute_target";
  from: number | null;
  value: number;
  unit: string;
  source_refs: string[];
};
```

Stable variable IDs remain internal. A finite explicit alias table maps emitted
labels to IDs (case/whitespace normalization only). There is no fuzzy matching,
embedding, business inference, model call or financial arithmetic in this check.
The server sends `authorized_changes` alongside source facts to the model.
Clients cannot supply their own authorization list through the current request.

## Current allowlist and source provenance

`buildScenarioAuthorizations` is a deliberately narrow upstream exact-fact
adapter. It recognizes complete statements in direct `operational_context`
entries, not arbitrary prose inside the semantic validator. Every referenced
fact must match its original context index and content. Only case, whitespace
and a trailing full stop are normalized. Extra clauses, negations, altered
numbers and unknown wording fail closed.

- Labor permission: `Tuesday evening 6 PM to 10 PM headcount may be tested by
  reducing headcount by 1 person.`
- Waste current/target context: `Ingredient waste last month was 9% of ingredient
  purchases. The business's stated internal target is 5%.` The same two exact
  sentences supplied as separate context entries are also supported, matching
  the existing Notes segmentation.
- Waste permission: `Waste rate may be tested from the current 9% toward the
  stated 5% target.`

The adapter also requires the matching explicit category and an allowlisted
confirmed-leak title. See `authorization.ts` for the complete finite title and
variable-label lists. Model-produced Evidence facts, citations and interpretations
cannot grant permission; costs, sales and targets without explicit permission
cannot grant permission either.

For the Cornhead fixture:

| Target leak | Variable ID | Type | From | Value | Unit | Required refs |
| --- | --- | --- | --- | --- | --- | --- |
| Tuesday evening labor inefficiency | tuesday_evening_headcount | delta | null | -1 | persons | input_15 |
| Ingredient waste exceeds stated target | ingredient_waste_rate | absolute_target | 9 | 5 | percent | input_12, input_16 |
| Delivery unit economics are poor for some orders | none | — | — | — | — | none |

IDs depend on source-fact order; the server rebuilds them deterministically for
each request rather than hardcoding them in validation. No unrelated calculator
inputs are required.

## Semantic rejection reasons

- `no_authorized_change`: a scenario targets a leak with no authorization.
- `unauthorized_variable`: the variable ID is unknown or belongs to another leak.
- `unauthorized_change`: type, baseline, value or unit differs from authorization.
- `missing_authorization_refs`: required source references are omitted.
- `duplicate_controlled_change`: the same authorization is repeated.
- `authorized_leak_abstained`: a fully authorized change was placed in the
  no-supported-change destination. Missing financial calculation inputs belong
  in scenario missing-input fields, not this destination.

## Scope

This is not a general natural-language permission extractor. Other businesses,
values, scopes, title variants or permission wording need an explicitly reviewed
adapter/structured-ingestion extension. Unknown wording is not guessed. Runtime
validation establishes a match to supplied recognized permission facts; it does
not establish real-world truth or validate every free-text explanatory sentence.

Reliability evaluation: ten independent live provider requests through the
production POST handler, hosted in an isolated temporary HTTP server for raw
usage capture. No production instrumentation or model-output logging was added.
All runs, raw outputs, timings and usage were saved in
`/tmp/whats-left-scenario-semantic-reliability.json`.
