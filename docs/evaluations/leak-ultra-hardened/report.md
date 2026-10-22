# Leak prompt hardening: Ultra-only follow-up

The two-line hardening produced **14 PASS / 0 PARTIAL / 2 FAIL** across 16 planned calls. Both failures remain incorrect Case A Waste bindings to `headcount_reduction`. The target of 15–16 PASS and zero incorrect bindings was not met. No additional prompt changes or calls were made after observing the result.

## Scope and exact production change

Only production source changed: `src/app/api/analyze/leaks/leaks.ts`, adding the following two lines to `leakSystemPrompt`:

> - Bind intervention_ref only when the cited facts support that exact intervention for the same finding and category. Never borrow interventions across categories: headcount_reduction is for labor findings only; waste_rate_target is for waste findings only; delivery findings must borrow neither. Do not infer intervention equivalence from semantic similarity. If no correctly matched eligible intervention exists, return intervention_ref: null; the finding remains unbound.
> - IDs are metadata, not prose. Put fact IDs only in evidence_refs; never write fact/source IDs or ID fragments (such as _12, fact_12, src_16) in titles, evidence, interpretations, or insufficient_evidence topic/reason text. Prose must contain only source-supported natural-language content.

All prior numeric discipline remains intact. Fact refs remain finding-level under the existing schema; there are no per-evidence-item refs or new citation mechanisms. The prompt-only change does not modify acceptance behavior. No schema, validator, authorization, orchestration, model configuration, timeout, retry, repair or fallback changed.

Production Leak remains **`nvidia/Nemotron-3_5-Lightning`**. Only the isolated evaluation transport selects **`nvidia/Nemotron-3-Ultra-550b-a55b`**.

## Method

Used the exact `cases.json` bytes from `docs/evaluations/leak-lightning-ultra` (8 inputs, including the saved accepted Ultra Case A Evidence/request), twice each: **16 new Ultra calls**. Input bytes and expected categories are unchanged. The existing evaluator/scoring and unchanged production handler/validators are reused. New evaluation metadata merely makes the previously manual cross-category/identifier checks explicit; it does not change production validation or scoring criteria.

Temperature 0.2, max_tokens 4000, thinking disabled, 60,000 ms timeout, two concurrent workers, no retries. Handler-generated provider request bodies are identical within each case's two observations. Real provider HTTP statuses and unchanged handler Response statuses are captured separately; no app/frontend or downstream endpoints were called.

All outputs were manually reviewed against the fixed source facts for qualitative correctness and derived numeric claims, using the same criteria as the original A/B. Structured ref digits are metadata; any IDs copied into prose remain subject to the unchanged guard. The supplementary numeric inventory examines every parsed prose field, even when the structural pass rejects first; inventory success is not production acceptance.

## Results

| Metric | Before: Ultra 16 calls | Hardened Ultra 16 calls |
| --- | ---: | ---: |
| PASS / PARTIAL / FAIL | 13 / 0 / 3 | 14 / 0 / 2 |
| Exact full-pass rate | 81.3% | 87.5% |
| Production output-validation pass | 13/16 | 14/16 |
| Incorrect/cross-category binding runs | 2 | 2 |
| Fact/source IDs in prose | 1 run | 0 |
| Uncited source-number failures | 0 | 0 |
| Forbidden derived-number violations | 0 | 0 |
| False-positive qualitative findings | 0 | 0 |
| Schema/provider failures | 0 | 0 |
| Timeouts | 0 | 0 |
| Mean latency | 1.576s | 1.931s |
| Maximum latency | 4.140s | 4.679s |

All 16 upstream responses were HTTP 200 and schema-valid. Fourteen handler responses were 200; two were 502 from the existing structural guard. Numeric prose inventory was clean in all 16; structural failures still reject. No false-positive leak conclusion or invented intervention permission was accepted. Qualitative category sets stayed consistent across all eight repeat pairs.

The 60-second timeout did not affect any call. Observed latencies show no meaningful timeout regression in this small batch; this is not proof against rare future timeouts. The original and follow-up samples are small and run at different times, so the one-run improvement is descriptive rather than a causal reliability estimate.

## Every run

Provider latency is measured round-trip; handler latency is additionally recorded in results.json.

| Case | Repeat | Provider / handler HTTP | Result | First validation failure | Latency |
| --- | ---: | --- | --- | --- | ---: |
| case_a | 1 | 200 / 502 | FAIL | incomplete_citation_support | 4.578s |
| case_a | 2 | 200 / 502 | FAIL | incomplete_citation_support | 4.679s |
| staffing_wording | 1 | 200 / 200 | PASS | — | 1.727s |
| staffing_wording | 2 | 200 / 200 | PASS | — | 1.820s |
| percentage_gap | 1 | 200 / 200 | PASS | — | 1.486s |
| percentage_gap | 2 | 200 / 200 | PASS | — | 1.793s |
| separate_fact_numbers | 1 | 200 / 200 | PASS | — | 1.626s |
| separate_fact_numbers | 2 | 200 / 200 | PASS | — | 1.594s |
| time_scope | 1 | 200 / 200 | PASS | — | 2.065s |
| time_scope | 2 | 200 / 200 | PASS | — | 1.692s |
| qualitative_only | 1 | 200 / 200 | PASS | — | 1.461s |
| qualitative_only | 2 | 200 / 200 | PASS | — | 1.265s |
| irrelevant_numbers | 1 | 200 / 200 | PASS | — | 1.635s |
| irrelevant_numbers | 2 | 200 / 200 | PASS | — | 1.276s |
| ambiguous | 1 | 200 / 200 | PASS | — | 1.114s |
| ambiguous | 2 | 200 / 200 | PASS | — | 1.087s |

[results.json](results.json) records generated findings/categories, every binding and cited fact ID, all numeric tokens by prose field, uncited numeric tokens, derived-number review, cross-category bindings, leaked IDs, false-positive review, schema/provider status, real validation results and latency for every observation. [summary.json](summary.json), [manifest.json](manifest.json) and [source-check.json](source-check.json) provide aggregate metrics and source/input hashes. No raw provider envelopes, credentials or headers are retained.

## Specific requested checks and exact remaining failure

1. **Case A passes both runs: no — 0/2.**
2. **Waste no longer bound to Labor: no.** In both runs, `leaks[1]` is Waste with `intervention_ref: headcount_reduction`. It cites only `fact_abbca75924f4c231a119ad1248d351f3_17`, `_18`, `_19` (same namespace).
3. **Ambiguous-case ID prose failure: absent in both repeats and all 16 outputs.** Both ambiguous outputs correctly return no leaks. This shows non-reproduction in this sample, not guaranteed elimination.
4. **Uncited 4 staff: absent.** Case A Labor cites `_12`, `_13`, `_14`, `_15`, `_16`, supporting the staffing count and comparison.
5. **Forbidden 4 percentage points or other derived values: absent.** Waste uses the reported current and target rates directly.

The same existing first-pass diagnostic rejects both Case A outputs:

```
reason: incomplete_citation_support
field: leaks[1].evidence_refs
missing_fact_ids:
  fact_abbca75924f4c231a119ad1248d351f3_12
  fact_abbca75924f4c231a119ad1248d351f3_14
  fact_abbca75924f4c231a119ad1248d351f3_16
```

The incorrect binding is not rescued by adding Labor refs to Waste. Waste must remain unbound when no eligible Waste intervention exists. Existing fail-closed rejection remains correct; no repair or exception was applied. The prompt did not solve this observed failure mode.

## Verification and files

- Production source: `src/app/api/analyze/leaks/leaks.ts` only, two prompt lines. A regression test removes exactly those lines and verifies the remainder equals the pre-change snapshot, preserving schema and surrounding code byte-for-byte.
- Evaluation-only addition: `scripts/evaluation/leak-ab/ultra-hardened.mjs`; four new tests in `tests/leak-prompt-hardening.test.mjs`; report artifacts in this directory. The historical evaluation inputs and results are unchanged.
- Focused Leak tests: **65 passed**. Full suite: **721 passed**. ESLint: passed. TypeScript: passed.
- Production build: **`next build --webpack` passed**, using the previously working build path for the known Turbopack port-binding limitation. No production build configuration changed.
- Of the 39 production source files, only the prompt file changed from the pre-edit snapshot. All 39 hashes remained stable during provider calls. Exact saved input bytes and repeated request hashes match.
- Exactly **16** Ultra calls. No retries, repairs, fallbacks, automatic second hardening attempt, production model switch, or downstream Scenario/Decision calls.

**Recommendation: keep current Leak model and harden further.**
