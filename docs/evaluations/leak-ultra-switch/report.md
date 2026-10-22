# Leak Ultra switch and live Case A acceptance

**ACCEPTANCE: PASS.** One real browser form submission through the existing local app and production route implementations reached frontend Complete. No fixtures/mocks replaced any response. Four real agent calls plus deterministic Calculator/Gate routes completed; no retries, repairs, fallbacks or alternate models.

## Model-only production change

`src/app/api/analyze/leaks/route.ts:10`:

```diff
-const NEBIUS_MODEL = "nvidia/Nemotron-3_5-Lightning";
+const NEBIUS_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";
```

Hash comparison and literal-reversal comparison prove this is the only production source change. Prompt, schema, binding resolver, validators, numeric guards, Evidence/authorization assembly, Scenario/authorization, Calculator, Gate, Decision, frontend and 60-second timeout remain unchanged. All production source hashes stayed stable during the run.

Six test files had only the expected production Leak model assertions updated; the Scenario model assertion remains Lightning. No test behavior or acceptance rule was loosened. Historical evaluation results were not rerun or rewritten.

## Verification

- Focused Leak/wording tests: **121 passed**.
- Full test suite: **735 passed**.
- ESLint: passed.
- TypeScript (`tsc --noEmit`): passed.
- Production build (`next build --webpack`, known working path): passed.

## Live stage results

Latencies are browser HTTP round trips, including route processing; provider-only latency is not separately instrumented. The test used the normal browser UI at localhost:3000, not isolated handler mocks. Configured exact model IDs are verified from the route implementations. Deterministic Scenario Authorization executes inside the Scenario endpoint and has no separate HTTP request/timer.

| Stage | HTTP/result | Latency | Model | Status |
| --- | --- | ---: | --- | --- |
| Evidence | 200 | 4.207s | nvidia/Nemotron-3-Ultra-550b-a55b | Validated |
| Leak | 200 | 3.593s | nvidia/Nemotron-3-Ultra-550b-a55b | Validated; resolved bindings |
| Scenario + deterministic Authorization | 200 | 2.192s | nvidia/Nemotron-3_5-Lightning | Validated; Labor only |
| Deterministic Calculator | 200 / not_calculable_yet | 0.113s | None | Valid |
| Deterministic Decision Gate | 200 / needs_more_data | 0.075s | None | Valid |
| Decision | 200 / collect_data | 1.583s | nvidia/nemotron-3-super-120b-a12b | Validated |
| Frontend | Complete | At 15.272s total | None | After genuine Decision success |

All stages used their single configured model/path, with retries=no, repairs=no, fallbacks=no. There were exactly six analysis endpoint requests, one per endpoint, with no browser exception or rejection diagnostic.

## Evidence authorization records

Canonical currency is USD. Exactly one assembled record:

```json
{
  "intervention": "headcount_reduction",
  "scope": "tuesday_evening_6pm_10pm",
  "operation": "delta",
  "from": null,
  "value": -1,
  "unit": "persons",
  "permission": "explicit",
  "permission_source_refs": [
    "src_abbca75924f4c231a119ad1248d351f3_16"
  ],
  "constraint": "rest_schedule_unchanged",
  "constraint_source_refs": [
    "src_abbca75924f4c231a119ad1248d351f3_16"
  ],
  "supporting_facts": [
    {
      "role": "sales",
      "value": 1900,
      "unit": "currency",
      "period": "month",
      "currency": "USD",
      "source_refs": [
        "src_abbca75924f4c231a119ad1248d351f3_12"
      ]
    },
    {
      "role": "staffing_cost",
      "value": 2500,
      "unit": "currency",
      "period": "month",
      "currency": "USD",
      "source_refs": [
        "src_abbca75924f4c231a119ad1248d351f3_14"
      ]
    }
  ]
}
```

No Waste or Delivery authorization record exists. Waste's reported target is not permission; Delivery has no approved controllable intervention.

## Leak

- Labor → headcount_reduction; refs _12/_13/_14/_15/_16, including the staffing count fact and complete authorization support.
- Waste → null; refs _17/_18/_19.
- Delivery → null; refs _20/_21.

All fact suffixes use namespace `fact_abbca75924f4c231a119ad1248d351f3_`. Existing structural/completeness and numeric/unit validation pass. Independent inspection found no uncited source numbers, unsupported numbers, forbidden derived values, identifiers in prose, incorrect category bindings, invented interventions or fabricated savings. Tuesday staffing cost remains Tuesday-scoped; Delivery introduces no threshold concept.

## Scenario / Calculation / Gate / Decision

Only authorized scenario: Tuesday evening headcount delta **-1 person**, authorization_id `tuesday_evening_headcount_reduction`. No pricing tactic, surcharge, fee, policy or new operational intervention was invented.

Waste: not_simulation_ready. Exact reason:

> Missing explicit permission to test reducing waste toward the stated 5% target.

Delivery: not_simulation_ready. Exact reason:

> Missing explicit permission to test a controllable change for delivery pricing, fees, packaging, discounts, minimum order size, or menu pricing.

Labor remains authorized with a defined scenario. Deterministic calculation returns **not_calculable_yet**, calculation=null, requiring:

- Authoritative baseline Tuesday evening headcount in persons for the affected period.
- Authoritative labor cost per worker for Tuesday evenings in the affected period and currency.

No savings are calculated or claimed. Gate returns **needs_more_data**, reason `no_calculable_scenarios`, top_candidate_id=null, verified_impact=null. Decision returns status needs_more_data, recommendation collect_data, candidate_id=null, with candidate-neutral rationale:

> More data is needed because no calculable scenarios exist.

Frontend displays Analysis complete, the real Decision result, and Run Analysis Again. Timeline inspection confirms Complete never appeared before Decision returned HTTP 200. Labor displays Scenario defined / Impact needs more data; Waste/Delivery remain not simulation-ready. What's Left / Margin behavior was not modified.

## Artifacts and limits

[live-case-a.json](live-case-a.json) preserves the observed request/response bodies, timing timeline and page text; [audit.json](audit.json) records acceptance checks. No secrets, provider headers or raw provider envelopes were captured. Server responses were observed, not replaced. Post-run local validators audited the saved responses without making any further provider or analysis endpoint calls.

**Total end-to-end latency: 15.272s. Retries: no. Repairs: no. Fallbacks: no.**

This is one successful live acceptance run, not a reliability batch or proof against future stochastic/provider failures. No changes were made after the run.
