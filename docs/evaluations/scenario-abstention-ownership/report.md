# Scenario abstention explanation ownership

## Change

The Scenario route still performs the same provider, schema, structural/reference and semantic authorization checks, in the same order. Only after successful validation, it projects `not_simulation_ready` into code-owned explanatory fields. Provider explanatory prose is not returned as the trusted abstention explanation. This is response ownership, not a repair that converts rejected output into accepted output.

Internal reason code: `no_eligible_authorized_change`.

- `reason`: `No eligible authorized change is available for this finding.`
- `missing_decision_input_categories`: `["An eligible authorized change"]`

These templates have no business numbers, category-specific facts, advice or inferred cause. In particular, absence of an eligible grant is not described as absence of permission: it may instead reflect a missing constraint or other requirement. Target identity is preserved. Actionable scenarios are preserved exactly. No response schema or frontend consumption changes. Calculator-generated not-calculable messages remain untouched.

The explanation module has no access to the global fact pool or Evidence prose. Both model-owned explanatory fields previously displayed by the frontend are discarded. The existing model prompt/schema remain unchanged; malformed/unauthorized outputs continue to reject before projection.

## Files changed

Production:
- `src/app/api/analyze/scenarios/abstention.ts` — code-owned projection/templates.
- `src/app/api/analyze/scenarios/route.ts` — apply projection after both validators.

Tests:
- `tests/scenarios-route.test.mjs` — four saved-case route replays, stable number-free projection, no mutation, invalid-output rejection; existing success assertion reflects new ownership.
- `tests/case-a-wording.test.mjs` — update superseded pass-through expectation; provider prompt/config and authorization checks remain.

Evaluation/documentation:
- `scripts/evaluation/judge-pipeline/run.mjs` — optional output directory and case selection for separately preserved targeted/full runs; defaults and app submission method remain unchanged.
- This directory: ownership boundary recorded before implementation, offline regression evidence and report.

## Offline targeted regression

See `offline-regression.json`. Each saved response is structurally and authorization validated using the production functions before explanation projection. These are deterministic saved-response tests, not new live runs.

| Case | Previous accepted Scenario explanation | Offline new result | Waste contamination | New explanation numeric/unit/scope escape | First causal failing stage in original artifact |
|---|---|---|---|---|---|
| J02 | Waste5% permission sentence on Labor | Code-owned generic eligibility explanation | Removed | None | Evidence total remains; not fixed by this task |
| J03 | Waste5% permission sentence on Labor despite existing permission | Code-owned generic eligibility explanation | Removed | None | Original Scenario escape removed in replay; fresh run unverified |
| J06 | Waste5% permission sentence on Delivery | Code-owned generic eligibility explanation | Removed | None | Original Scenario escape removed in replay; fresh run unverified |
| J07 | Waste5% permission sentence on Delivery despite authorized Waste trial | Code-owned generic eligibility explanation | Removed | None | Original Scenario escape removed in replay; fresh run unverified |

All actionable scenario arrays are identical before/after. Existing authorization, calculator and binding regressions pass. Invalid blank explanation still rejects before projection; authorized-finding abstention remains rejected by existing authorization validation.

## Local verification

- Focused Scenario route/authorization/calculator/display: 100/100 pass.
- Full suite: 746/746 pass.
- ESLint: pass.
- TypeScript `tsc --noEmit`: pass.
- Production build `next build --webpack`: pass (known working path).

## Approved live evaluation results

After explicit approval, exactly **16** normal-app submissions were made: four targeted cases followed by the full twelve-case suite. Existing saved note payloads and production providers/models were used unchanged. The same browser form, sequential pipeline, fixed case oracles, raw response capture, deterministic checks and manual semantic review were used. Independent cases continued after terminal errors; each submission stopped naturally at its first rejected route. No submission was retried. The full suite's J07 is the separately planned full-suite submission, not a retry of targeted J07.

Artifacts are separated into `targeted/` and `full/`, each retaining manifests, original payloads, raw runs, automatic results, reviewed results, source checks and summaries. The original evaluation artifacts were preserved. The full payload hash matches the original evaluation manifest. Across both runs there were 80 app endpoint calls and 56 configured provider attempts (14 targeted, 42 full); deterministic routes do not call providers. No alternate models or downstream calls outside the normal app pipeline were introduced.

### Targeted live cases

| Case | Original result / first causal layer | Fresh targeted result | New Scenario explanation | Waste contamination | First causal layer changed? | Latency |
|---|---|---|---|---|---|---:|
| J02 | FAIL / Evidence totals, later Scenario contamination | FAIL, frontend Complete | Generic code-owned eligibility | Removed; no new explanation numeric/unit/scope escape | No: Evidence totals remain | 12.841s |
| J03 | FAIL / Scenario explanation | PASS, Complete | Generic code-owned eligibility | Removed; no new escape | Yes: no failing layer | 14.595s |
| J06 | FAIL / Scenario explanation | PASS, Complete | Generic code-owned eligibility | Removed; no new escape | Yes: no failing layer | 15.840s |
| J07 | FAIL / Scenario explanation | FAIL, stopped at Leak | Not reached | Not testable in this targeted run | Yes: Leak numeric rejection precedes Scenario | 6.878s |

Targeted J07 diagnostic: `{ "reason": "unreported_number", "field_path": "leaks[0].evidence[1]", "normalized_number": "16000" }`. This is a rejected claim, not an accepted escape. Raw rejected prose/refs are not retained by production. Do not infer its exact sentence. No patch or retry followed. Targeted aggregate: **2 PASS / 0 PARTIAL / 2 FAIL**, 3/4 Complete, zero accepted Scenario contamination across all three reached Scenario results.

### Full twelve-case comparison

| Metric | Original twelve-case evaluation | Fresh twelve-case evaluation |
|---|---:|---:|
| PASS / PARTIAL / FAIL | 1 / 0 / 11 | **8 / 0 / 4** |
| Safe completed outcomes (full acceptance PASS) | 1/12 | **8/12** |
| Frontend Complete | 6/12 | **9/12** |
| Numeric/unit/scope escape cases | 5 | **1** |
| Accepted Scenario contamination cases | 4 | **0** |
| Application validation failures | 4 | **3** |
| Provider boundary failures | 2 | **0** |
| Authorization violations | 0 | **0** |
| Trusted binding violations | 0 | **0** |
| Fabricated savings | 0 | **0** |
| Decision Gate violations | 0 | **0** |
| Average end-to-end latency | 26.601s | **12.710s** |
| Maximum end-to-end latency | 67.407s | **22.378s** |

There were nine accepted Scenario responses, containing seven abstention entries. Every abstention entry contained exactly the deterministic reason and required-input label above, with no numeric claims. All four previously contaminated cases reached Scenario in the full suite. J02/J03/J06 reasons are generic; J07 preserves the authorized Waste change while Labor/Delivery explanations stay generic. No new accepted numeric/unit/scope escape was found in manual review.

Only J02 remains an accepted grounding escape: `revenue.total=10000` (unreported sum of Tuesday2100 and Friday7900) and `costs.total=3300` (Tuesday staffing cost promoted to whole-business total). J09 returned null business totals this time. **Evidence was not fixed:** that difference is stochastic run variability, not a consequence or guarantee of explanation ownership. Likewise J04/J08 earlier Leak rejections did not reproduce, J12 completed, and J11 stopped earlier at Leak. The overall pass/latency improvement cannot all be causally credited to this narrow change or treated as a reliability estimate from one run per case.

### Full-suite endpoints and remaining failures

All latencies below are browser end-to-end. Dashes mean unreached stages. Sim/Gate are deterministic routes.

| Case | Evidence | Leak | Scenario | Sim | Gate | Decision | Final | Complete | Latency |
| J01 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 15.998s |
| J02 | 200 | 200 | 200 | 200 | 200 | 200 | FAIL | Yes | 12.121s |
| J03 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 14.543s |
| J04 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 11.753s |
| J05 | 502 | — | — | — | — | — | FAIL | No | 1.740s |
| J06 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 9.601s |
| J07 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 15.521s |
| J08 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 12.065s |
| J09 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 18.467s |
| J10 | 200 | 200 | 502 | — | — | — | FAIL | No | 22.378s |
| J11 | 200 | 502 | — | — | — | — | FAIL | No | 6.309s |
| J12 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | 12.018s |

Remaining first failures:

- **J02 — Evidence:** unsupported business totals above. App reaches Complete, but semantic acceptance is FAIL. Scenario explanation is corrected; no authorization was invented.
- **J05 — Evidence:** HTTP502 `Evidence currency conflicts with the explicit source currency or is unsupported.` Known source-currency-line parser false rejection remains untouched.
- **J10 — Scenario:** HTTP502 `Scenario analysis result rejected by deterministic validation.` Rejected before explanation projection. Existing route does not retain a finer path or rejected body; no exact missing field is asserted.
- **J11 — Leak:** HTTP502 `Leak analysis result rejected by output validation: unreported_number.` Diagnostic `{ "reason": "unreported_number", "field_path": "leaks[1].interpretation", "normalized_number": "3100" }`. No Scenario call occurred. Evidence preserved contradictory sales and produced no authorization. Assembly diagnostic showed two scoped-sales atoms, missing permission and one schedule-constraint atom despite source ambiguity; this does not prove a valid constraint extraction, and no grant/action resulted. Rejected Leak prose/refs are unavailable.

Three authorized scenarios remain: Labor in J01/J09 (−1 person), Waste in J07 (9%→5%, with explicit permission). All three simulations returned `not_calculable_yet`, no calculation or savings. Six other completed cases had empty simulation sets. Gate returned `needs_more_data` for the three uncalculable candidates and `no_actionable_scenario` for the six empty sets. All nine Decisions returned bounded `collect_data` with no selected candidate. Calculator and Gate exact recomputation, Decision validation, binding recomputation and frontend completion-after-Decision checks passed for all reached successful states.

### Verification after submissions

- Focused Scenario/authorization/calculator/display/evaluation tests: **105/105 pass** (rerun in this task).
- Implementation verification remains **746/746 full tests**, lint, TypeScript and Webpack production build passing. No implementation edits were made during these live runs, so these checks were not needlessly repeated.
- `verification.json` confirms identical models/payloads and unchanged production source during each live evaluation. The only production differences from the original stress-test baseline are the Scenario route and new abstention module.

## Scope verification

Comparison with the stress-test manifest finds only the Scenario route changed among the original 40 production files, plus the new abstention module. Evidence, currency parsing, timeout/provider configuration, model selection, authorization policy and validators, intervention binding, calculator, Gate, Decision and frontend are unchanged. No retries, repairs or fallbacks introduced. Exactly 16 approved app submissions were completed; no retries, repairs or fallbacks.
