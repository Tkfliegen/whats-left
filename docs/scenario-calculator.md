# Deterministic Scenario Calculator

`POST /api/analyze/simulate` accepts `SimulationRequest` and returns
`SimulationResponse` (exact types: `src/types/scenario-calculator.ts`). It is
separate from the Scenario Agent route, has no model or network dependency,
and is not connected to the dashboard. Malformed requests return HTTP 400;
valid scenarios without compatible formula inputs return HTTP 200 with
`not_calculable_yet`, `calculation: null`, and explicit missing inputs.

## Input contract

Pass `{ evidence, scenarios, input_facts }`, using the validated Evidence,
ScenarioResult, and source mapping returned upstream. Original prose facts
are not parsed again. Scenario changes supply the proposed delta/target and
current waste rate; their numeric source references are request paths such as
`scenarios.scenarios[0].controlled_changes[0].value`.

Additional authoritative calculation facts must already be structured by a
trusted data producer, not guessed by an LLM or extracted from Notes by this
calculator. Put the exact `CalculationFact` JSON in a source-mapping entry with
a unique stable input ID and a `calculation_inputs.` source prefix. Example:

```json
{
  "id": "input_21",
  "source": "calculation_inputs.baseline_headcount",
  "fact": "{\"concept\":\"baseline_headcount\",\"scope\":\"tuesday_evening\",\"value\":4,\"unit\":\"persons\",\"period\":\"last_month\",\"currency\":null}"
}
```

`CalculationFact` has exactly: `concept`, `scope`, `value`, `unit`, `period`,
`currency`. Current supported combinations:

| Concept | Scope | Unit | Currency |
| --- | --- | --- | --- |
| baseline_headcount | tuesday_evening | persons | null |
| labor_cost_per_worker | tuesday_evening | currency_per_person | Explicit Evidence currency |
| ingredient_purchases | ingredient_waste | currency | Explicit Evidence currency |

Periods must exactly equal `evidence.period`. Monetary currency must match
Evidence's explicit three-letter currency code. Unknown, conflicting,
duplicate, negative or incompatible facts do not enable calculation. Malformed
structured facts are rejected. Other source facts remain untouched.

The calculator validates references and structure, not the real-world truth of
caller-supplied authoritative data. There is no automatic data-ingestion adapter
yet. Existing Cornhead facts have no structured per-worker cost/headcount or
purchases basis, so neither scenario is calculable.

## Formula registry

The registry specifies exact aliases, change type, unit, required inputs,
validation and calculation function. Case and whitespace normalization only;
no fuzzy matching. One controlled change per calculation is supported.

- `LABOR_HEADCOUNT_DELTA`: variable aliases `Tuesday evening headcount` and
  `tuesday_evening_headcount`, and `Tuesday evening 6 PM to 10 PM headcount`;
  `delta`, `persons`. Baseline and projected cost
  are baseline/projected headcount times explicit per-worker cost for the
  affected period. Impact is baseline minus projected cost. Headcounts and
  deltas must be integers; projected headcount cannot be negative. A supplied
  scenario baseline must agree with the structured baseline. Never divide
  aggregate labor cost to invent per-worker cost.
- `INGREDIENT_WASTE_RATE_TARGET`: aliases `Ingredient waste rate` and
  `ingredient_waste_rate`; `absolute_target`, `percent`. Baseline waste cost
  is explicit ingredient purchases times current rate / 100; projected waste
  cost is purchases times target rate / 100. Impact is baseline minus projected.
  Ingredient cost is never a substitute for purchases.

Rates use 0–100 percent in requests, normalized to 0–1 inside the waste formula.
Only final monetary baseline/projected/impact values are rounded to cents:
nearest cent, ties away from zero, with floating-point epsilon correction.
Intermediate values are not rounded. Impact is rounded from the unrounded
baseline-minus-projected difference. Positive impact is a cost reduction;
negative impact is a cost increase. These are cost effects, not total profit
forecasts. Values outside safe cent-resolution numeric range are refused.

Every calculation input has a name, value, unit and source reference. Currency
and period retain their authoritative Evidence values. Unknown formulas,
unsupported combinations and incompatible/missing inputs produce no partial
impact. There are no recommendation or ranking fields.
