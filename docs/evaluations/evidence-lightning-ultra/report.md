# Production Evidence baseline: Lightning vs Ultra

22 October 2026 · Asia/Dubai. **Recommendation: switch Evidence to Ultra.** This is a recommendation only; production remains unchanged. In this identical-note evaluation Ultra retained zero false-positive permissions and zero unsafe authorization outcomes, while Lightning produced a false Waste permission on the exact Case A. The table and examples below show the complete result, including unavailable authorization assessments after provider/validation failure.

Exact deployed Evidence model: `nvidia/Nemotron-3_5-Lightning`. Ultra: `nvidia/Nemotron-3-Ultra-550b-a55b`.

| Metric | Lightning | Ultra (reused) |
|---|---:|---:|
| New / reused inference calls | 16 / 0 | 0 / 16 |
| PASS / PARTIAL / FAIL | 7 / 3 / 6 | 16 / 0 / 0 |
| Exact full-pass rate | 7/16 (43.8%) | 16/16 (100.0%) |
| Expected-atom completeness | 65/82 (79.3%) | 82/82 (100.0%) |
| Misclassification rate | 7/72 returned atoms (9.7%) | 0/82 returned atoms (0.0%) |
| False-positive permission atoms | 4 | 0 |
| Unsafe authorization probes | 2 | 0 |
| Deterministic authorization correctness | 11/14 assessed; 2 unavailable | 16/16 assessed; 0 unavailable |
| Provider/output failures / timeouts | 1 / 1 | 0 / 0 |
| Average latency, including failures | 27.105 s | 2.596 s |
| Maximum latency | 60.016 s | 3.972 s |

## Per-note results

| Note | Lightning repeat 1 / 2 | Ultra repeat 1 / 2 | Lightning avg | Ultra avg |
|---|---|---|---:|---:|
| case_a | FAIL / FAIL | PASS / PASS | 46.623 s | 3.837 s |
| paraphrased | FAIL / PASS | PASS / PASS | 37.114 s | 2.530 s |
| different_numbers | PASS / PASS | PASS / PASS | 22.680 s | 2.157 s |
| split_constraint | FAIL / PARTIAL | PASS / PASS | 20.455 s | 2.410 s |
| target_without_permission | PARTIAL / PARTIAL | PASS / PASS | 23.593 s | 1.813 s |
| permissions_missing_calculation | PASS / PASS | PASS / PASS | 35.605 s | 2.667 s |
| irrelevant_sources | PASS / PASS | PASS / PASS | 17.817 s | 3.118 s |
| ambiguous_no_grant | FAIL / FAIL | PASS / PASS | 12.954 s | 2.235 s |

## Concrete differences

- **Case A, Lightning repeat 1:** invented `waste_reduction_permission`, `permission: explicit`, from 9 to 5, citing `src_abbca75924f4c231a119ad1248d351f3_17` and `_18`. Those are the observed baseline and target, not test permission. Schema, numeric anchors and final record validation passed, so the offline complete-ref authorization probe produced the unexpected `ingredient_waste_rate_target`. This is an unsafe semantic extraction risk, not a recall omission. Ultra’s two saved Case A runs produced exactly six expected atoms and only the Labor grant.

- **paraphrased, Lightning repeat 1: FAIL**. provider_timeout. Latency 60.016 s. Missing: not recorded / none. Unexpected/misclassified: none / unavailable. Validation diagnostics: []. Downstream probe: unavailable; provider/output rejected before accepted authorization.

- **split_constraint, Lightning repeat 1: FAIL**. atom_validation_failed. Latency 29.304 s. Missing: scoped_staffing_cost. Unexpected/misclassified: scoped_staffing_cost. Validation diagnostics: [{"reason":"currency_mismatch","atom_index":1,"failing_field":"currency"}]. Downstream probe: unavailable; provider/output rejected before accepted authorization.

- **target_without_permission, Lightning repeat 1: PARTIAL**. Valid safe omission. Latency 38.931 s. Missing: current_waste_rate, waste_target_rate. Unexpected/misclassified: none / unavailable. Validation diagnostics: []. Downstream probe: correct.

- **ambiguous_no_grant, Lightning repeat 1: FAIL**. incorrect_atomic_extraction. Latency 16.558 s. Missing: scoped_sales, scoped_staffing_cost. Unexpected/misclassified: headcount_reduction_permission, schedule_constraint. Validation diagnostics: []. Downstream probe: correct.

- **case_a, Lightning repeat 2: FAIL**. incorrect_atomic_extraction. Latency 37.124 s. Missing: not recorded / none. Unexpected/misclassified: waste_reduction_permission. Validation diagnostics: []. Downstream probe: unsafe unexpected authorization.

- **split_constraint, Lightning repeat 2: PARTIAL**. Valid safe omission. Latency 11.606 s. Missing: scoped_sales, scoped_staffing_cost. Unexpected/misclassified: none / unavailable. Validation diagnostics: []. Downstream probe: safe but incomplete.

- **target_without_permission, Lightning repeat 2: PARTIAL**. Valid safe omission. Latency 8.255 s. Missing: current_waste_rate, waste_target_rate. Unexpected/misclassified: none / unavailable. Validation diagnostics: []. Downstream probe: correct.

- **ambiguous_no_grant, Lightning repeat 2: FAIL**. incorrect_atomic_extraction. Latency 9.350 s. Missing: scoped_sales, scoped_staffing_cost. Unexpected/misclassified: headcount_reduction_permission, schedule_constraint. Validation diagnostics: []. Downstream probe: correct.

## Method, safety and limits

Exactly **16 new Lightning inference calls**: the same eight notes × two preplanned repetitions, sequentially with one active call. **Zero new Ultra calls**: all 16 Ultra results were reused byte-for-byte at the row level from `../evidence-super-ultra/results.json`. No retries, repairs, fallback, prompt changes, schema changes, validator changes or production configuration changes. All production source hashes and the reference Ultra result hash were verified unchanged.

Before reuse, the runner checked identical note text, expected atoms/source associations, timeout, Ultra identifier and every production source hash against the prior manifest. Scoring uses the same judge and unchanged production prompt/schema/atom validators/assembler/final validator. Requests are captured from the production route. Lightning uses that exact deployed-model request. Both evaluations use temperature 0.2, max_tokens 4000, thinking disabled and strict atomic JSON schema.

PASS requires complete correct atoms, valid source associations and correct authorization. PARTIAL is valid safe output missing expected atoms. FAIL includes unexpected/misclassified atoms, invalid support, malformed responses, provider failures or unsafe authorization. False-positive permissions count unexpected permission kinds where the annotated note grants none; other wrong permission fields/source support are included in misclassification. Completeness includes missing atoms in timed-out calls. Misclassification rate uses returned atoms as denominator, so it must be read alongside provider failures and completeness.

Deterministic authorization is an **offline probe** using synthetic findings with complete trusted refs, not a live Leak/Scenario run. An unsafe probe demonstrates that the extracted record can authorize an unsupported intervention when correctly cited; it does not claim that a real Leak response selected those refs. Calls failing before accepted assembly have unavailable downstream assessment; the table does not count them as correct grants.

The existing **60,000 ms timeout** was not changed. Lightning timed out 1 times; its maximum observed request latency was 60.016 s. Ultra had zero timeouts and max 3.972 s. Thus the timeout is a concern for Lightning in this workload; it was not a concern for Ultra in the saved sample. No increase is recommended as a substitute for extraction safety.

Lightning and Ultra were measured in separate windows. The prior run had one call per model active (two overall); Lightning had one active call overall. Timing therefore has provider-load/cache confounding and is not a controlled same-time benchmark. Eight unique notes × two repetitions are a focused smoke comparison, not a production reliability guarantee. No ordinary Evidence prose semantics or live downstream UI behavior were comprehensively evaluated.

Ultra’s advantage here goes beyond higher recall: it avoided the observed unsupported permission while remaining within the existing timeout. A model change should remain scoped to Evidence and reviewed separately; this task makes no change. Additional safety coverage would still be useful after any separately authorized change.

## Artifacts and checks

- `results.json`: every extracted safe atom, omission/misclassification, validator result, assembled record, downstream probe, HTTP status and latency for 16 new Lightning and 16 reused Ultra rows.

- `manifest.json`: exact inputs, annotations, identifiers, settings, source hashes and reference Ultra result hash.

- `source-check.json`: production and reference-result immutability check.

- Isolated runner: `scripts/evaluation/evidence-ab/lightning-followup.mjs`; existing scorer reused unchanged except adding Lightning to its model registry.

- Relevant harness tests: **14 passed**. Full suite: **706 passed**. Project lint: passed. TypeScript: passed. Production build (`next build --webpack`): passed.

Evaluation started: 2026-10-21T23:36:36.574Z; finished: 2026-10-21T23:43:51.501Z. All dates above use the user’s Asia/Dubai date.
