# Leak Detective: Lightning vs Ultra

Recommendation: **prompt hardening still required; do not switch production yet.** Ultra substantially improves supported-finding recall and latency, but does not improve end-to-end validation acceptance in this sample and fails both Case A observations through incorrect intervention binding. No recommendation was implemented.

## Setup and scoring

- Current production Leak: `nvidia/Nemotron-3_5-Lightning`.
- Candidate: `nvidia/Nemotron-3-Ultra-550b-a55b`.
- 8 fixed inputs × 2 independent observations × 2 models = **32 new calls**, 16 per model. No older runs included in these metrics.
- Case A is the exact saved accepted Ultra Evidence and operational-context input. The other seven are explicitly authored, source-backed evaluation fixtures, validated by the existing input validator and code-generated provenance. No additional Evidence calls were made.
- The unchanged production POST handler generates the prompt/schema/settings and decides acceptance in isolation. Only the model ID is substituted at the evaluation transport boundary. For each case, all four provider payloads are verified identical except model. Temperature 0.2, max_tokens 4000, thinking disabled, timeout 60,000 ms unchanged. Two concurrent workers, no automatic retries.
- Provider HTTP status is a real live upstream status; Leak HTTP status is the unchanged handler's Response status, without a running app server or frontend.
- Expected qualitative categories were declared before calls. PASS requires real output-validation success, all supported qualitative issues present, and source-grounded conclusions. PARTIAL is valid/safe but misses a supported issue. Any validation/provider failure or unsupported finding is FAIL. Optional numeric details need not be repeated when a concise finding is already supported.
- Manual source-grounded review checked all generated findings and explanations for invented facts, forbidden numeric arithmetic, unsafe conclusions and incorrect bindings. Conservative empty findings on the ambiguous case are correct. The labor fixtures establish a plausible scoped mismatch, not proof that reducing staff will preserve sales.

## Comparison

All rates use 16 calls per model; the metrics overlap and should not be added together.

| Metric | Lightning | Ultra |
| --- | ---: | ---: |
| PASS / PARTIAL / FAIL | 2 / 12 / 2 | 13 / 0 / 3 |
| Exact full-pass rate | 12.5% | 81.3% |
| Production numeric/citation output-validation acceptance | 14/16 (87.5%) | 13/16 (81.3%) |
| Structural/reference pass | 16/16 | 14/16 |
| Numeric token inventory clean | 14/16 | 15/16 |
| Runs with uncited source-reported numbers | 2/16 (12.5%) | 0/16 |
| Runs with forbidden derived-number claims | 0/16 | 0/16 |
| False-positive qualitative leak conclusions | 0/16 | 0/16 |
| Incorrect intervention bindings | 0/16 | 2/16 (12.5%) |
| Fact IDs copied into prose causing numeric rejection | 0/16 | 1/16 (6.3%) |
| Schema/malformed failures | 0/16 | 0/16 |
| Provider errors / timeouts | 0 / 0 | 0 / 0 |
| Mean provider latency | 13.447s | 1.576s |
| Maximum provider latency | 42.410s | 4.140s |
| Same qualitative category sets across repeats | 8/8 pairs | 8/8 pairs |

Production output-validation acceptance includes both passes of the real validator. Numeric inventory is a supplementary diagnostic, not acceptance: Case A Ultra has clean numeric prose but fails binding/completeness first. All validly parsed outputs were inventoried even if the first production pass rejected them. Structured reference-ID digits are excluded from numeric prose inventory, matching the existing contract; IDs embedded inside prose are not excluded. Existing insufficient_evidence fields use the full trusted source catalog, since they have no per-item refs. No evaluation exception changes those rules.

Qualitative consistency does not mean correctness or identical prose: Lightning consistently omitted supported issues on six cases, while Ultra's ambiguous-case validation varied despite consistently conservative conclusions.

## Per-case results

Each cell lists repeat 1 / repeat 2. Detailed per-run provider/handler statuses, actual latency, structured conclusions, refs, every prose field's numeric tokens, all uncited tokens, real first rejection, and manual semantic review are in [results.json](results.json). The fixed inputs and expected issues are in [cases.json](cases.json).

| Case | Test | Lightning | Ultra |
| --- | --- | --- | --- |
| case_a | Exact saved accepted Ultra Case A Evidence/request, unchanged | FAIL / FAIL | FAIL / FAIL |
| staffing_wording | Reported headcount must be cited if mentioned | PARTIAL / PARTIAL | PASS / PASS |
| percentage_gap | Baseline and target; unreported subtraction is forbidden | PARTIAL / PARTIAL | PASS / PASS |
| separate_fact_numbers | Separate fact IDs for each supporting numeric claim | PARTIAL / PARTIAL | PASS / PASS |
| time_scope | Time windows and scoped financial values must not leak across refs | PARTIAL / PARTIAL | PASS / PASS |
| qualitative_only | Supported qualitative delivery loss; no amounts or derived metrics | PARTIAL / PARTIAL | PASS / PASS |
| irrelevant_numbers | Unrelated numbers must not be borrowed as leak support | PARTIAL / PARTIAL | PASS / PASS |
| ambiguous | Large costs without inefficiency evidence: conservative empty findings | PASS / PASS | FAIL / PASS |

Lightning's 12 PARTIAL results are safe omission failures: it often demands explicit test permission, targets, or exact financial impact before identifying a leak already supported by the source. For example, qualitative-only delivery explicitly reports costs exceeding revenue; Lightning returns no finding because order count/loss amount is missing. Ultra correctly reports unprofitable orders without inventing an amount. On the percentage fixture, Ultra states the reported 12% and 7% without calculating their difference. Neither model used the irrelevant address, pets or software-version numbers to fabricate a finding.

## Concrete failures

### Lightning: original Case A staffing citation failure reproduced 2/2

Both Case A repeats reject at `leaks[1].evidence[1]` with normalized `4`:

> During that Tuesday evening period, we normally scheduled 4 staff members.

The Labor finding cites facts `fact_abbca75924f4c231a119ad1248d351f3_12`, `_14`, `_16` (the abbreviated last two IDs use the same namespace). They allow `6, 10, 1900, 2500, 625, 1`, but not `4`. Fact `_13` supplies the staffing count and was not cited. The interpretation also repeats uncited `4`. This is a source-reported but uncited number, correctly rejected; not invented arithmetic.

### Ultra: Case A incorrect Waste binding reproduced 2/2

Ultra's Labor finding correctly cites facts `_12`, `_13`, `_14`, `_15`, `_16`; the staffing count is supported. But Waste incorrectly returns `intervention_ref = headcount_reduction` with only Waste facts `_17`, `_18`, `_19`.

Both runs fail first-pass validation:

```
reason: incomplete_citation_support
field: leaks[1].evidence_refs
missing_fact_ids:
  fact_abbca75924f4c231a119ad1248d351f3_12
  fact_abbca75924f4c231a119ad1248d351f3_14
  fact_abbca75924f4c231a119ad1248d351f3_16
```

Waste should be unbound. This is not a false-positive observation that waste exceeds target, but it is an incorrect controlled-intervention association and a real FAIL. Existing validation blocks acceptance before any downstream authorization. No downstream agent was invoked to test it and no authorization grant was manufactured.

### Ultra: fact IDs in prose, ambiguous case repeat 1

The finding set correctly stays empty. However, the insufficient-evidence explanation includes:

> Monthly labor cost is USD 32,000 (fact_a30b1efb449893d60cf061b451b6ad09_02) with total revenue USD 90,000 (fact_a30b1efb449893d60cf061b451b6ad09_01) ...

The numeric guard correctly treats these IDs as prose and rejects `insufficient_evidence[0].reason`. The first rejected normalized token is `30`, followed by other ID fragments, not calculated business metrics. Exact per-field token lists are retained in results.json. This is formatting/identity leakage into prose, not a validator/parser defect or a reason to add a normalization exception. Repeat 2 is conservative and valid.

## Recurrence and recommendation

- Case A uncited `4 staff`: Lightning 2/2; Ultra 0/2.
- Forbidden derived `4 percentage points`: neither model in this 32-call batch. Other obvious unreported percentage differences also did not appear. The prior isolated Lightning reproduction did show this behavior, so this batch does not establish its absence generally.
- No unsupported numeric business value other than Lightning's uncited staffing count was observed. Ultra's separate numeric failure came from ID fragments copied into prose.
- Ultra recovered supported qualitative findings in every non-ambiguous case and is markedly faster, but its real output acceptance is lower (81.3% vs 87.5%) and both exact Case A runs fail. Higher recall alone does not meet the safety-first switch criteria.
- **Prompt hardening is still required before recommending a model switch**, specifically correct binding scope and keeping IDs out of prose. Do not add facts to refs automatically, special-case numeric tokens, weaken validators, or repair responses. No prompt or runtime change has been implemented here.
- Two repeats on eight authored inputs are a controlled small evaluation, not a production reliability estimate. Unbound synthetic fixtures intentionally probe leak identification independently of permission; only exact Case A exercises an eligible assembled intervention group. Evidence Ultra's earlier success does not predict Leak Ultra's binding reliability.
- The 60-second timeout did not affect either model here. Ultra's maximum was 4.140s; Lightning's was 42.410s. This sample provides no evidence of a timeout regression for Ultra and cannot exclude rare future timeouts. Latencies are observed with two concurrent calls, not an unloaded benchmark.

## Checks and unchanged production

- Added only `scripts/evaluation/leak-ab/evaluate.mjs`, `tests/leak-ab-evaluation.test.mjs`, and evaluation artifacts under this report directory.
- Five new harness tests cover fixed valid cases/exact Case A, model-only substitution, real handler acceptance, safe omission versus false-positive scoring, numeric inventory excluding structural IDs, and one-call provider failure behavior.
- Focused suite: **61 passed**. Full suite: **717 passed**. ESLint: passed. TypeScript `tsc --noEmit`: passed.
- Default Turbopack build could not bind a required local port (`Operation not permitted`), including an escalated attempt. **Production Webpack build (`next build --webpack`) passed** without source/config changes. No app validation calls were made by build checks.
- All **39 production src file hashes are unchanged**, verified against the pre-call manifest; [source-check.json](source-check.json) records exactly 32 calls and identical payloads except model.
- No production configuration, prompt, schema, numeric guard, citation rule, Evidence, authorization, Scenario, calculator, Gate, Decision, frontend, timeout, retry, repair, or fallback was modified.
- Exactly 32 planned isolated Leak provider calls; no automatic retries and **zero downstream Scenario/Decision calls**. No raw provider envelope, keys or headers retained. Structured generated output and user-authorized synthetic/source inputs are retained for review.
