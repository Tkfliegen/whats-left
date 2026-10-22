# Evidence Agent Super vs Ultra evaluation

22 October 2026 · Asia/Dubai. Recommendation: **gather more data before deciding**. Ultra improved atom recall and latency in this sample, but both models preserved the same correct authorization outcomes. No production model change is justified by an authorization-safety difference here.

Production Evidence actually uses `nvidia/Nemotron-3_5-Lightning`. The requested Super comparator, `nvidia/nemotron-3-super-120b-a12b`, is the current Decision model, not the Evidence baseline. Ultra was `nvidia/Nemotron-3-Ultra-550b-a55b`. Both requested IDs were verified in the configured Nebius catalog. This test does not measure an improvement over the deployed Lightning Evidence model.

| Metric | Super | Ultra |
|---|---:|---:|
| Inference calls | 16 | 16 |
| PASS / PARTIAL / FAIL | 14 / 2 / 0 | 16 / 0 / 0 |
| Exact full-pass rate | 14/16 (87.5%) | 16/16 (100.0%) |
| Expected-atom completeness | 74/82 (90.2%) | 82/82 (100.0%) |
| Misclassified atoms | 0/74 (0%) | 0/82 (0%) |
| Runs with misclassification | 0/16 | 0/16 |
| False-positive/incorrect permission atoms | 0 | 0 |
| Unsafe authorization outcomes | 0 | 0 |
| Provider/output failures / timeouts | 0 / 0 | 0 / 0 |
| Average request latency | 4.199 s | 2.596 s |
| Maximum request latency | 6.410 s | 3.972 s |

All 32 responses passed the current Evidence schema, atom/source/numeric validators and final authorization-record validator. Offline deterministic authorization probes matched expected authorization IDs in **16/16 runs per model**. There were **zero FAIL results and zero timeouts**; Super’s two PARTIAL results were valid, safe omissions.

## Per-note results

Each model ran each note twice. Latencies below average those two requests.

| Note | Super repeats | Ultra repeats | Super avg | Ultra avg |
|---|---|---|---:|---:|
| case_a: Exact current Case A, unchanged | PASS / PASS | PASS / PASS | 4.962 s | 3.837 s |
| paraphrased: Same facts and differently phrased explicit owner permission | PASS / PASS | PASS / PASS | 5.063 s | 2.530 s |
| different_numbers: Different reported amounts; no per-worker calculation input | PASS / PASS | PASS / PASS | 4.449 s | 2.157 s |
| split_constraint: Permission and unchanged-schedule constraint in separate source sentences | PASS / PASS | PASS / PASS | 4.817 s | 2.410 s |
| target_without_permission: Negative control: Waste target exists, no approved test or Labor candidate | PASS / PASS | PASS / PASS | 3.546 s | 1.813 s |
| permissions_missing_calculation: Both explicit grants, but no baseline headcount, worker cost or purchase basis | PASS / PASS | PASS / PASS | 4.285 s | 2.667 s |
| irrelevant_sources: Valid facts mixed with Friday numbers, delivery data and unrelated statements | PASS / PASS | PASS / PASS | 4.919 s | 3.118 s |
| ambiguous_no_grant: Ambiguous hypothetical staffing idea; must fail closed without permission/constraint | PARTIAL / PARTIAL | PASS / PASS | 1.550 s | 2.235 s |

## Concrete findings

- **Exact Case A:** both models returned all six expected atoms on both calls. Both assembled Labor with sales USD 1,900, staffing cost USD 2,500, explicit -1-person permission, and `rest_schedule_unchanged`. Permission and constraint correctly shared original source `_16`. Waste baseline 9% and target 5% did not produce a Waste grant.

- **Ambiguous note:** Super returned `authorization_atoms: []` twice. This safely withheld authorization but omitted scoped sales, scoped staffing cost, current Waste rate, and Waste target. Ultra returned those four observational atoms twice, without inventing permission or constraint. Both assembled no records and preserved fail-closed authorization. This is a recall difference, not an unsafe Super decision.

- **Split permission/constraint:** both models selected the separately annotated source IDs and assembled Labor correctly twice. Neither lost the constraint during assembly.

- **Permission with missing calculation inputs:** both models extracted all seven expected atoms and correctly assembled Labor and explicitly permitted Waste. Missing headcount/per-worker cost/purchase basis did not remove supported permission; this harness evaluates authorization, not live downstream financial calculation.

- **Target without permission:** both models extracted the two Waste-rate atoms, no permission atom, and no authorization, on both repeats.

- Ultra’s average latency was 38.2% lower in this window. Ultra was slower than Super on the ambiguous note, where Super returned no atoms. This is a small paired sample, not a general latency benchmark.

## Method and scoring

32 inference calls: eight notes × two models × two scheduled repetitions. The second repetition was planned in advance, not a retry. There was also one read-only model-catalog request. A local CLI environment-loader failure occurred before inference began; it sent zero requests and was fixed in the isolated harness. No inference calls were retried.

Each request was captured from the real production Evidence route using a local mock fetch, then sent with **only the model ID changed**. Endpoint: `https://api.tokenfactory.nebius.com/v1/chat/completions`. Settings remained temperature 0.2, max_tokens 4000, thinking disabled, strict current JSON schema and the existing **60,000 ms timeout**. At most two calls ran concurrently, one per model, pairing each input; model launch order reversed for repeat two. The 60s timeout affected **neither** model: Ultra max latency was 3.972 s.

Expected atoms and source associations were annotated before inference in `scripts/evaluation/evidence-ab/cases.mjs`; annotations were not sent to the models. PASS requires every expected atom with correct fields and supporting original source IDs, no unexpected/duplicate/misclassified atoms, passing production validators, and correct deterministic authorization. PARTIAL means valid safe output missing expected atoms. FAIL covers malformed/provider failures, invalid support, unexpected/misclassified atoms or unsafe grants. Completeness counts matched expected atoms against all expected atoms, including omissions; misclassification counts unmatched returned atoms. Extra relevant context refs are allowed within the annotated Labor/Waste group, but the designated supporting source must be cited.

Downstream authorization was checked locally through the unchanged builder using synthetic controlled findings with complete code-resolved refs. No Leak, Scenario, Simulation, Gate or Decision provider calls were made. This isolates Evidence reliability and does not test live Leak citation selection, frontend behavior, or all ordinary Evidence prose/amount semantics.

Only safe structured atoms, validation outcomes, assembled records, authorization IDs and timings are retained per run. Raw provider envelopes, model prose, headers and credentials are not persisted. Annotated input notes are retained in the manifest for reproducibility.

## Decision and limits

**Gather more data before deciding.** Ultra is promising for recall and speed, but the full-pass gap is concentrated in one ambiguous note repeated twice; no positive authorization case or safety control distinguished the models. Eight unique notes and two repetitions cannot establish a durable reliability or safety advantage. Repeating identical prompts is not equivalent to testing more unique safety cases. The deployed Lightning model also remains untested in this comparison. A later separately authorized evaluation should include that actual baseline and more withheld-permission, conflicting/withdrawn-permission and mixed-scope inputs before a production change.

Production source hash verification: **no changed source files**. No architecture, validators, acceptance behavior, prompts, timeout, production model or orchestration changed.

## Artifacts and checks

- `results.json`: all 32 classifications, safe extracted atoms, missing/unexpected atoms, validator results, assembled records, deterministic authorization probes and latency.

- `manifest.json`: inputs, predeclared expectations, models, settings and production source hashes.

- `source-check.json`: unchanged production source verification.

- Isolated harness: `scripts/evaluation/evidence-ab/{cases,evaluate}.mjs`.

- Harness tests: 10 passed. Full suite: 702 passed. Project ESLint: passed.

Official identifier references: [Nebius Super cookbook](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-super-120B.md), [Nebius Ultra cookbook](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-ultra-550b-a55b.md). Actual availability was checked against the configured endpoint catalog.
