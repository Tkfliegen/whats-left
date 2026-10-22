# Final combined-state judge-style evaluation

## Method and result

Exactly twelve normal browser form submissions, one for each original saved J01–J12 payload, using the same fixed case oracles, app path, sequential pipeline, response observation, deterministic recomputation and manual source-grounded review as the prior suites. The case-set hash matches the original evaluation. Each failed application flow stopped naturally; subsequent independent cases continued. No retries, repairs, fallbacks, alternate models, payload changes or production changes. No broad additional experiment.

**Reviewed results: 6 PASS / 0 PARTIAL / 6 FAIL. Frontend Complete: 7/12.** A correct fail-closed route rejection is FAIL for end-to-end completion scoring, not automatically a production defect. Complete is not a correctness score: J09 completed but is FAIL for an accepted derived claim.

Source hashes for all 42 production files match the immediately preceding J02-fix manifest and remained unchanged throughout evaluation. Models remain Evidence/Leak `nvidia/Nemotron-3-Ultra-550b-a55b`, Scenario `nvidia/Nemotron-3_5-Lightning`, Decision `nvidia/nemotron-3-super-120b-a12b`. No prompt/schema/configuration/timeout/authorization/binding/calculator/Gate/frontend changes.

## Comparison

| Metric | Original baseline | Post-Scenario change | Final combined state |
|---|---:|---:|---:|
| PASS / PARTIAL / FAIL | 1 / 0 / 11 | 8 / 0 / 4 | **6 / 0 / 6** |
| Frontend Complete | 6/12 | 9/12 | **7/12** |
| Safe completed outcomes (full acceptance) | 1/12 | 8/12 | **6/12** |
| Numeric/unit/scope escape cases | 5 | 1 | **1 (J09)** |
| Accepted Scenario contamination cases | 4 | 0 | **0** |
| Application validation failures | 4 | 3 | **5** |
| Provider boundary failures | 2 suspected timeouts | 0 | **0** |
| Authorization violations | 0 | 0 | **0** |
| Trusted binding violations | 0 | 0 | **0** |
| Fabricated savings | 0 | 0 | **0** |
| Decision Gate violations | 0 | 0 | **0** |
| Average end-to-end latency | 26.601s | 12.710s | **10.652s** |
| Maximum end-to-end latency | 67.407s | 22.378s | **18.349s** |

The remaining escape is a **different issue** from post-Scenario J02's business totals. Current J02 totals are null, and J05 passes currency normalization. Their end-to-end outcomes now fail later for separate model output defects. Overall pass counts and latency cannot be attributed entirely to code changes: stochastic completions, provider timing and which stage is reached contribute. The original baseline's two timeout classifications were suspected, not conclusively diagnosed.

## All twelve cases

HTTP columns show real app endpoints; — means unreached. All latencies are browser end-to-end. First causal stage includes accepted semantic failures, not only HTTP errors.

| Case | E | L | S | Sim | Gate | D | Classification | Complete | First failure | Latency |
| J01 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | None | 14.308s |
| J02 | 200 | 200 | 200 | 200 | 200 | 502 | FAIL | No | Decision | 9.847s |
| J03 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | None | 11.292s |
| J04 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | None | 11.122s |
| J05 | 200 | 200 | 502 | — | — | — | FAIL | No | Scenario | 10.765s |
| J06 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | None | 9.866s |
| J07 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | None | 18.349s |
| J08 | 200 | 502 | — | — | — | — | FAIL | No | Leak | 5.399s |
| J09 | 200 | 200 | 200 | 200 | 200 | 200 | FAIL | Yes | Leak (accepted escape) | 14.464s |
| J10 | 200 | 200 | 502 | — | — | — | FAIL | No | Scenario | 6.590s |
| J11 | 200 | 502 | — | — | — | — | FAIL | No | Leak | 5.602s |
| J12 | 200 | 200 | 200 | 200 | 200 | 200 | PASS | Yes | None | 10.222s |

E=Evidence, L=Leak, S=Scenario, D=Decision. There were 58 app endpoint calls and 42 configured provider attempts (12 Evidence + 12 Leak + 10 Scenario + 8 Decision). The other calls are deterministic. No endpoint was called twice within a submission.

## Every non-PASS case

| Case | First failing stage | Exact available deterministic reason / field | Classification | Interpretation |
|---|---|---|---|---|
| J02 | Decision, HTTP502 | `missing_priority_inputs` | **b: correct fail-closed rejection** | Gate supplied `An eligible authorized change` as a grounded missing input. Decision omitted required priorities. Existing validator correctly rejected; the fixed business totals remained null. |
| J05 | Scenario, HTTP502 | `duplicate_controlled_change` | **b: correct fail-closed rejection** | Semantic authorization validator encountered the same eligible authorized change twice. The source grants one Waste9%→5% trial. Rejection prevents duplicated changes; currency was canonical USD and Evidence200. |
| J08 | Leak, HTTP502 | `unreported_number`, `leaks[0].interpretation`, normalized `2026` | **b: correct fail-closed rejection** | Year2026 exists globally in source context, but not in the failing finding's cited fact text. Global presence is insufficient. No unit exemption or expanded citation pool is justified. |
| J09 | Leak, HTTP200 | **No production rejection.** Manual review: `leaks[0].interpretation`, “over four times the revenue” | **a: confirmed production defect** | An unreported derived numeric comparison passed the digit-only prose guard. Full trace below. |
| J10 | Scenario, HTTP502 | `Scenario analysis result rejected by deterministic validation.` Child path unavailable. | **d: insufficient diagnostics** | Rejected before authorization/explanation projection. Valid empty output is allowed by the current contract; raw rejected completion and failing branch are not retained. No demonstrated validator bug and no behavior fix justified from this artifact. |
| J11 | Leak, HTTP502 | `unreported_number`, `leaks[1].interpretation`, normalized `3100` | **b: correct fail-closed rejection** | USD3100 is a source-reported but unreconciled till value. It was absent from that finding's cited fact set. Rejection preserves citation discipline; source presence does not make the disputed figure authoritative. |

The four cases classified b exhibit model-output reliability problems rather than confirmed application validator bugs. Model variability may explain differences between runs but does not invalidate the deterministic rejection. No case is classified as a provider failure in this run. Rejected Scenario/Decision/Leak prose is not retained; exact sentences, finding identities or refs absent from diagnostics have not been invented. J08/J11's field paths and normalized values are exact retained diagnostics, not inferred reconstructed payloads.

### J09 accepted derived-ratio escape

Exact accepted `leaks[0].interpretation`:

> The Tuesday late sitting operates with a significant revenue-to-wage gap (USD 1,650 revenue vs USD 2,750 wages) while using identical staffing to Friday evenings, which generate over four times the revenue. The owner has explicitly approved a controlled test reducing Tuesday staffing by one person, indicating recognition of potential overstaffing for that shift.

The offending quantitative claim is **“over four times the revenue.”** Tuesday revenueUSD1650 and Friday revenueUSD6800 are explicitly reported. Their relative multiple is not. The mathematical comparison is true, but deriving it violates the existing no-derived-arithmetic rule; numerical correctness does not make it reported evidence.

Cited finding refs are `fact_c1f82f94b8eb7a4a6440e229a406a34e_04`, `_05`, `_06`, `_07`, `_08`, `_09`. `_04` contains Tuesday revenue/wages; `_06` contains Friday revenue. The group also supports staffing, permission and unchanged-schedule constraint. Complete citations support the **inputs**, not a newly computed ratio. The source has no reported four-times claim.

`validateLeakOutput` in `src/app/api/analyze/leaks/output.ts` extracts tokens with `\d+(?:,\d{3})*(?:\.\d+)?`. Its rate-unit pattern is also digit based. The word **four** is therefore never tested as a numeric claim. The frontend numeric guard likewise did not prevent completion. This is an observable coverage gap, not a citation false rejection or unsafe intervention binding. Labor remained correctly bound/authorized, and no savings were calculated.

The automatic audit initially marked J09 PASS because its numeric inventory also checks digits. Manual review changes it to FAIL in `results.json`; `results-automatic.json` preserves the provisional output. No production validation rule was changed to obtain the reviewed score.

## Verification of the combined fixes and safety state

- **Business totals:** J02 and J09 trusted revenue/cost totals are null. Original explicit business totals are retained for J01 (78000/75500), J10 revenue80000 and J12 (60000/54000), with successful source-bound support diagnostics. No model-derived business aggregate was accepted in reviewed output.
- **Currency:** J05 returns Evidence200 with USD. The old currency rejection did not recur.
- **Abstention ownership:** Every accepted Scenario abstention uses the number-free code-owned eligibility text/label. No Waste target appears in Labor/Delivery abstention explanations.
- **Authorization/binding:** Labor grants/bindings exist only in J01/J09. Waste grants/bindings exist only in J05/J07, where explicit test permission exists. J03 remains unapproved because the required constraint is missing. J11 has no authorization for conflicting evidence. No Delivery intervention is granted. No unsafe authorized action was accepted.
- **Calculation/Gate:** All eight reached simulation/Gate endpoints returned200. J01/J07/J09 are `not_calculable_yet`; five other simulation sets are empty. No calculable savings were manufactured. Gate is `needs_more_data` for the three uncalculable candidates and `no_actionable_scenario` for five empty sets. Exact offline calculator/Gate recomputation checks pass.
- **Decision/frontend:** Seven successful Decisions are bounded `collect_data` with no selected candidate; J02's invalid Decision is rejected. Each of seven Complete states follows real Decision200. J09 still fails semantic acceptance despite Complete.

As in the prior manual reviews, Evidence `missing_information` questions are distinguished from asserted source facts. J05 lists unrelated Tuesday6–10 staffing questions; the automatic inventory flags those digits. Those are unavailable-data questions, not accepted financial/numeric claims, and the first actual failed layer is Scenario. This is retained as an observation rather than counted as an additional grounding escape. The original scoring criteria have not been relaxed for the new Leak ratio.

## Submission decision

1. **Trust/safety submission-ready? Not yet under the stated source-bound numeric standard.** Authorization, binding, calculator and Gate safeguards held, but one unsupported derived numeric claim reached frontend Complete.
2. **Genuine remaining production defect:** J09 exposes word-form quantified-ratio coverage missing from Leak prose validation. J02/J05/J08/J11 are correct fail-closed rejections. J10 remains undiagnosed, not a confirmed validator defect.
3. **Another production change justified? Yes:** narrowly strengthen Leak numeric-prose validation for unreported word-form quantitative ratios while preserving all current checks and source-only/no-derived-arithmetic rules. Do not weaken any safeguard to improve completion scores, and do not change authorization, models or providers on the basis of these failures. No implementation is included.

Artifacts: `cases.json`, `manifest.json`, `submitted.json`, `runs/J01.json`–`runs/J12.json`, `results-automatic.json`, reviewed `results.json`, `summary.json`, `source-check.json` and `verification.json`. Production code/configuration unchanged; twelve submissions only; no retries, repairs or fallbacks.
