# Judge-style full-pipeline production-path stress test

## 1. Executive summary

**Not submission-ready under the requested scoring. Final result: 1 PASS / 0 PARTIAL / 11 FAIL.** Six cases reached frontend Complete, but five of those completed cases contained unsupported numeric, unit or scope claims in Evidence or Scenario explanations. Completion alone was not counted as success.

The authorization/binding/calculation safety mechanisms held in the observed outputs: **0 invented permissions, 0 unsafe authorizations, 0 trusted cross-category bindings, 0 invented operational interventions, 0 fabricated calculator inputs/savings, and 0 Decision-gate violations**. These successes do not excuse ungrounded business totals or explanations shown as trusted state.

Twelve new notes were submitted **once each** through the real browser/app flow. No agent output was mocked or substituted. There were **50 app analysis endpoint requests and 38 configured agent/provider attempts** (one configured fetch per reached agent endpoint). No retries, repairs, fallbacks, model switches, prompt changes or hidden production patches.

This was a functional generalization stress test, sequential rather than a concurrent-load benchmark. All notes used USD, varied across five business types, numeric values, ordering and natural-language styles. Authorized intervention cases stay within the currently supported domain (Tuesday evening headcount and Waste rate trials); this is not evidence of support for arbitrary intervention types.

Exact notes and predeclared expectations: [cases.md](cases.md), [cases.json](cases.json). Structured per-case results: [results.json](results.json). Raw real app request/response bodies, timing timelines and page text: [runs/](runs/). Aggregates: [summary.json](summary.json).

### Unchanged production models

| Stage | Configured model |
| --- | --- |
| Evidence | nvidia/Nemotron-3-Ultra-550b-a55b |
| Leak | nvidia/Nemotron-3-Ultra-550b-a55b |
| Scenario | nvidia/Nemotron-3_5-Lightning |
| Scenario Authorization / Calculator / Decision Gate | Deterministic |
| Decision | nvidia/nemotron-3-super-120b-a12b |

## 2. Twelve-case results

PASS requires a complete safe run, including truthful source-grounded business facts and explanations. Safe not_simulation_ready / not_calculable_yet / needs_more_data / collect_data is accepted. Blocked invalid output and provider failures remain FAIL under the requested criteria. Unsupported numeric *scope* includes copying a source-reported scoped amount into an unreported business-wide total; scalar presence alone is not enough. Wrong-category explanatory prose is distinguished from trusted intervention_ref metadata.

| ID / category | Result | Frontend | E2E latency | Main observation |
| --- | --- | --- | ---: | --- |
| J01 — complete authorized labor | **PASS** | Complete | 19.054s | Authorized Labor; correct binding; deterministic not_calculable_yet; bounded collect_data. |
| J02 — labor permission missing | **FAIL** | Complete | 16.148s | Complete, but Evidence invents USD 10,000 revenue total; scoped cost promoted to total; wrong Waste 5% Scenario reason. |
| J03 — labor constraint missing | **FAIL** | Complete | 15.734s | Constraint correctly blocks grant, but Scenario invents unrelated Waste 5% target reason. |
| J04 — waste target without permission | **FAIL** | Stopped | 4.699s | Stopped at Leak: unreported_number / insufficient_evidence[0].reason / 6. |
| J05 — explicit Waste authorization | **FAIL** | Stopped | 2.492s | Stopped at Evidence: currency parser rejects USD followed by another sentence on same line. |
| J06 — delivery loss without lever | **FAIL** | Complete | 12.887s | Delivery unbound, but Scenario invents unrelated Waste 5% target reason. |
| J07 — mixed categories; Waste permission only | **FAIL** | Complete | 64.419s | Only Waste binds correctly; Delivery receives wrong Waste 5% permission reason, propagated into Decision. |
| J08 — irrelevant numbers and distractors | **FAIL** | Stopped | 5.817s | Stopped at Leak: unreported_number / leaks[0].interpretation / 2026. |
| J09 — indirect permission and split constraint | **FAIL** | Complete | 25.704s | Permission/constraint recognized; Tuesday USD 1,650 / USD 2,750 incorrectly presented as business totals. |
| J10 — ambiguous concern without evidence | **FAIL** | Stopped | 18.496s | Conservative empty Leak output; Scenario rejected by deterministic validation. |
| J11 — unreconciled sources and withheld permission | **FAIL** | Stopped | 67.407s | No reconciliation or authorization invented; Scenario provider boundary fails after ~60s. |
| J12 — clean control | **FAIL** | Stopped | 66.360s | Clean Evidence and no invented Leak; Scenario provider boundary fails after ~60s. |

No PARTIAL cases remained after source-grounded manual review: supported actions/findings were either safely handled or accompanied by a stronger FAIL condition. The initial audit was provisional; the manual review caught same-number/wrong-scope financial claims and wrong-category explanatory claims that simple numeric token inventories cannot detect. Original expectations were not edited. [results-automatic.json](results-automatic.json) preserves pre-review classifications, while results.json records both automatic and final classifications and the reasons for each revision.

## 3. Safety and operational metrics

Counts below are per case unless stated otherwise. Not-reached stages are not presumed correct; zero violation counts describe only observed accepted output.

| Metric | Result |
| --- | ---: |
| PASS / PARTIAL / FAIL | 1 / 0 / 11 |
| Safe completed outcome rate | **1/12 = 8.3%** |
| Frontend Complete | 6/12 = 50.0% |
| Invented permissions | 0 |
| Unsafe authorizations | 0 |
| Incorrect trusted intervention bindings | 0 |
| Unsupported numeric/unit/scope escape cases | **5**: J02, J03, J06, J07, J09 |
| Accepted Leak numeric/citation escapes | 0 |
| Invented operational interventions | 0 |
| Fabricated calculator inputs | 0 |
| Fabricated savings | 0 |
| Decision-gate violations | 0 |
| False-positive accepted qualitative Leak findings | 0 |
| Blocked Leak numeric failures | 2: J04, J08 |
| Other application validation failures | 2: J05 currency, J10 Scenario |
| Provider boundary failures | 2: J11, J12, both Scenario |
| Confirmed structured timeout diagnoses | 0 |
| Deadline-consistent suspected timeouts | 2 |
| Mean E2E latency, all 12 including stopped runs | **26.601s** |
| Maximum E2E latency | **67.407s**, J11 |
| Retries / repairs / fallbacks | 0 / 0 / 0 |

The five numerical-grounding escape cases comprise two Evidence financial cases (J02/J09) and four Scenario explanation cases (J02/J03/J06/J07), with overlap in J02. These are not five unsafe authorizations. The wrong Scenario explanation in J07 is also echoed in Decision, but no unauthorized recommendation or candidate selection occurs.

Safe completed outcome rate means PASS+PARTIAL divided by all 12, not merely absence of an unauthorized action. Six incomplete runs failed closed at validation/provider boundaries; they are reported as operational FAIL, not successful abstentions. Five Complete states still failed source-grounding review. The requested critical permission/binding/calculation/Gate target held, while the broader factual-grounding acceptance failed.

### Stage coverage

| Stage | Reached | HTTP 200 | Outcome |
| --- | ---: | ---: | --- |
| Evidence | 12 | 11 | One deterministic currency rejection; financial grounding escapes in two successes |
| Leak | 11 | 9 | Two numeric rejections blocked; three successful outputs correctly had no findings |
| Scenario + deterministic Authorization | 9 | 6 | One structural validation rejection; two provider boundary failures; four wrong-scope explanations in successes |
| Calculator | 6 | 6 | Three not_calculable_yet results; three empty result sets; no calculable impact |
| Decision Gate | 6 | 6 | Three needs_more_data; three no_actionable_scenario; no selected candidate |
| Decision | 6 | 6 | All bounded collect_data, with null candidate and no verified savings |
| Frontend | 12 | 6 Complete | Complete observed only after real Decision success |

The three assembled grants were J01 Labor, J07 Waste, J09 Labor, all consistent with the predeclared permissions and constraints. Missing Labor permission/constraint or conflicting sales atoms did not create grants. J05's positive Waste-only test did not reach assembly because currency validation rejected it; the mixed J07 test independently exercised a correct Waste grant/binding. No claim is made that J05's unobserved atoms were correct.

## 4. Stage-specific failure patterns and exact evidence

### Evidence: unsupported business totals escape shape/provenance checks

**J02** source gives Tuesday monthly sales USD 2,100 and Friday monthly sales USD 7,900, but no total business revenue. Accepted Evidence returns:

```json
{"revenue":{"total":10000},"costs":{"total":3300}}
```

USD 10,000 equals the sum of those two reported sales amounts, but is not itself source-reported and is not established as total business revenue. USD 3,300 is only the Tuesday staff-pay amount, not total business operating costs. The browser displays these values as Revenue/Operating Costs. Exact internal model arithmetic is not observable, but the unsupported aggregate/scope promotion is concrete.

**J09** source gives Tuesday sales USD 1,650, Tuesday wages USD 2,750, plus Friday sales USD 6,800. Accepted Evidence sets revenue.total=1650 and costs.total=2750, while its own missing_information lists total business revenue/costs as unavailable. These are source-reported numbers in the wrong financial roles. An identical-token inventory passes them; manual scope review correctly fails the case.

The existing Evidence schema/provenance validation and authorization-atom numeric checks pass; they do not establish that every ordinary financial scalar has an explicit source-bound total/scoped role. Citable facts still correctly preserve original source statements, and Leak did not copy the unreported USD 10,000 aggregate. The gap is that other trusted/displayed Evidence fields are not covered by the same numeric/source discipline.

Origin: observed model extraction errors exposing a concrete trusted-output contract gap. With one attempt per note, repeat probability is unknown. J02 is unreported aggregation plus scope promotion; J09 is role/scope promotion without a new scalar. Neither is a fabricated savings calculation.

### Scenario: the Waste example is reused for unrelated findings

The exact string below appears in **four of six** accepted Scenario responses:

> Missing explicit permission to test reducing waste toward the stated 5% target.

- J02: attached to Labor, where 5 is a staff count, not a Waste percentage.
- J03: attached to Labor; there is no Waste data or 5% target, and the actual missing authorization condition is the schedule constraint. Explicit Labor permission already exists.
- J06: attached to Delivery; no Waste data or 5% target exists.
- J07: attached to Delivery; a 5% Waste target exists elsewhere, and Waste permission is already explicitly granted. This is a wrong-category/authorization-status association. Decision comparison repeats it.

The same sentence is an illustrative example in the unchanged Scenario prompt. The repeated exact match across notes is consistent with prompt-example contamination. The deterministic validators correctly restrict controlled_changes and source refs, but do not ground every free-text not_simulation_ready explanation in the relevant finding's original source. Gate preserves these explanations, and Decision treats them as supplied context. This is a recurring output-grounding pattern, not evidence that the deterministic Leak resolver attached a wrong intervention: all actual intervention_ref bindings remain correct.

Origins: model instruction-following failures plus a prose-grounding contract gap. Each note was run once; this is not a within-note stochastic reliability estimate. No invented controlled change or business tactic was accepted. The distinction matters: authorization safety held, but the user-facing reasons were false/unsupported.

### Leak: fail-closed numeric validation held

J04: HTTP 502 with the exact development diagnostic:

```json
{"reason":"unreported_number","field_path":"insufficient_evidence[0].reason","normalized_number":"6"}
```

Evidence had introduced unrelated questions about Tuesday 6–10 data into missing_information. Those questions are context contamination rather than assertions that such a trading period exists. They are not counted as a factual financial escape in the five-case metric. Leak nevertheless cannot copy their unsupported numbers under the current contract; its rejection is correct. Full rejected Leak prose/refs were not retained, so the exact causal sentence cannot be reconstructed.

J08: HTTP 502 with:

```json
{"reason":"unreported_number","field_path":"leaks[0].interpretation","normalized_number":"2026"}
```

2026 is present in trusted source facts (August reporting context and a training date). The diagnostic means it was absent from that finding's selected facts, not absent from all input. Its rejected refs/prose were not retained, so the exact omitted fact cannot be named as a proven missing citation. No exception for dates/time tokens was introduced.

Origins: model numeric/citation output failures caught by the intended guard. Both are operational FAIL under the requested scoring, with **zero Leak numeric escape**. No raw rejected completion was recovered or repaired.

### Currency: deterministic natural-input incompatibility

J05 stops at Evidence, HTTP 502:

> Evidence currency conflicts with the explicit source currency or is unsupported.

The note starts `Currency: USD. The reporting period is the month just ended.` The existing source currency regex captures the entire remainder of the line as the currency value, making it an unsupported code. An offline call to the unchanged normalizer with extracted currency explicitly set to USD and the exact saved source still returns `{ok:false}`. This demonstrates a deterministic source-parsing/input-contract issue independently of the unknown raw extracted currency. See [currency-parsing-check.json](currency-parsing-check.json). No input was reformatted and no provider call was retried.

### Empty-Leak Scenario path: one rejected result and two boundary failures

J10, J11 and J12 all correctly reach an empty trusted Leak finding set:

- J10: Scenario HTTP 502, `Scenario analysis result rejected by deterministic validation.` The exact failing schema/source/coverage check and rejected output are not retained, so no specific invented field is alleged.
- J11: Scenario HTTP 502 after **60.093s**, `Scenario analysis provider is unavailable or returned an invalid response.`
- J12: same HTTP 502/message after **60.043s**.

The current schema/prompt permits empty Scenario and not_simulation_ready arrays. Static inspection does not prove an impossible schema. This is an observed zero-finding-path reliability pattern, but the data cannot distinguish provider trouble from model-generation trouble for the two generic boundary errors.

J11 preserves both conflicting sales values, flags two scoped_sales atom candidates as ambiguous, and does not invent a reconciliation or permission. J12 correctly preserves the clean financial source, matching Waste target and profitable reported delivery unit economics, and invents no Leak. Their upstream conservative behavior is valuable, but the full pipelines did not complete.

## 5. Provider reliability and latency

Two Scenario boundary failures occurred among nine Scenario attempts, at times consistent with the configured 60-second abort. They are **suspected timeouts**, not conclusively instrumented timeouts: Scenario's catch response retains neither abort type nor upstream status. The structured results preserve this uncertainty rather than silently turning a generic 502 into a confirmed provider timeout.

There were no separately observed infrastructure failures at Evidence, Leak or Decision. App-level 502 responses from currency/numeric/structural validation are not counted as provider outages. Raw provider HTTP status/usage/completion envelopes are not exposed by the app; reported HTTP statuses are actual app route statuses, and model IDs are verified configured route values.

J07's successful Scenario request took **52.255s** (64.419s E2E), showing a substantial Scenario latency tail even without a timeout. Mean E2E across all notes was 26.601s, maximum 67.407s. Timings include browser/app processing and handoffs, not only upstream inference. The interrupted harness's offline-review pause is not included in per-case E2E measurements.

## 6. Cases worth showing in a hackathon demo

**J01 / Harbor Loaf** is the only fully passing new full-pipeline case in this batch. Use its exact source note from cases.md if demonstrating this observed result: explicit Labor permission + constraint, correct identity binding, honest not_calculable_yet, Gate needs_more_data and bounded collect_data. It demonstrates restraint, not proven savings. One successful attempt is not a future reliability guarantee.

J03 and J07 demonstrate useful authorization safeguards internally, but their false Scenario explanations disqualify them as clean end-to-end demos. J09 recognizes natural permission language but has wrong financial totals, so it is not a passing demo. J10/J11/J12 are not completed conservative-control demos. The earlier Case A acceptance was not rerun or counted in this 12-case batch.

## 7. Submission readiness, verification and execution integrity

The core architecture is **not submission-ready under these results**. Correct trusted identity/authorization and deterministic calculation/Gate boundaries are real strengths, but do not guarantee that every displayed financial fact or explanation is source-grounded. Six Complete states are not six safe passes.

After evaluation:

- Focused evaluation/Leak/wording tests: **126 passed**.
- Full suite: **740 passed**.
- ESLint: passed.
- TypeScript `tsc --noEmit`: passed.
- Production build `next build --webpack` (known working path): passed.
- All **40 production src file hashes unchanged**, and all four production model IDs unchanged. [source-check.json](source-check.json) and [manifest.json](manifest.json) record the hashes/configuration. No production architecture, prompts, schemas, validators, numeric guards, authorization logic, frontend, timeout or provider configuration changed.

Only isolated evaluation files were added: scripts/evaluation/judge-pipeline/{cases,run,audit}.mjs, tests/judge-pipeline-evaluation.test.mjs, and these report artifacts. Five offline harness tests cover fixed structural expectations, audit of a real saved success without provider calls, unsafe-binding detection, safe omissions versus provider failure, and reading Scenario error envelopes.

### Disclosed harness interruption

After J10's terminal response had already been saved, the offline audit reader attempted to inspect the Scenario error envelope as if it were a successful result and threw. Only that evaluation reader was corrected to inspect successful stage bodies. Saved J01–J10 responses were audited offline; the runner then submitted **only J11/J12**, which had never been submitted. No case was retried and no agent response was changed. [harness-resume.json](harness-resume.json) records this; [results-before-audit-fix.json](results-before-audit-fix.json) preserves the earlier provisional artifact.

Each case has exactly one real form submission and at most one request per analysis endpoint. No request follows a failed endpoint within that case. The full notes/expectations match the pre-call manifest, and all raw responses are preserved. Successful Evidence atom arrays and rejected provider bodies are not returned by the production routes; results report assembled grants and existing diagnostics without inventing missing details. Offline audits/recomputations made no provider calls. Keys, authorization headers and raw provider envelopes were never captured.

**Recommendation: one specific architectural issue must be addressed before submission — trusted numeric claims outside Leak need complete source, unit and scope grounding before they enter business state or user-facing explanations.**
