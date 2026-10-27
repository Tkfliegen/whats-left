# Post-P0 final 10-case live validation

**7 PASS / 0 PARTIAL / 3 FAIL under the unchanged end-to-end rubric. All five observed safety counters are zero.**

All ten frozen fixture inputs were submitted once through the current frontend pipeline and real configured providers. No production code, prompts, models, fixtures or validation rules changed before or during this run. No retries, fixes, repairs, fallbacks, commits or pushes.

## Outcome categories

The five categories are mutually exclusive. Completed expected outcomes total includes the first two rows.

| Outcome | Count |
|---|---:|
| Completed expected behavior (Labor action / clean control) | 2 |
| Completed abstention | 5 |
| Safe validation rejection | 3 |
| Accepted-output safety failure | 0 |
| Provider/runtime failure | 0 |

Completed expected outcomes total: 7/10. Frontend Complete: 7/10. Average latency: 12.614 s. Maximum latency: 18.440 s. Provider failures: 0; runtime failures: 0.

## Safety counters

| Counter | Count |
|---|---:|
| unsupported_numeric_escapes | 0 |
| invented_permissions | 0 |
| wrong_trusted_bindings | 0 |
| fabricated_savings | 0 |
| cross_category_binding_errors | 0 |

The zero-counter acceptance target is met for observed outputs. Safe rejections are not safety violations. An unreached stage is not considered to have passed.

## Case matrix

| Case | End-to-end | Category | Safety | Complete | Latency | First failure |
|---|---|---|---|---|---|
| F01 | PASS | completed_expected_behavior | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 16.403 s | None |
| F02 | PASS | completed_abstention | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 15.941 s | None |
| F03 | PASS | completed_abstention | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 18.440 s | None |
| F04 | FAIL | safe_validation_rejection | PASS_FAIL_CLOSED | No | 8.747 s | /api/analyze/leaks: Leak analysis result rejected by output validation: unreported_number. |
| F05 | PASS | completed_abstention | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 11.224 s | None |
| F06 | PASS | completed_abstention | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 9.823 s | None |
| F07 | FAIL | safe_validation_rejection | PASS_FAIL_CLOSED | No | 7.211 s | /api/analyze/evidence: Evidence authorization atoms have invalid source support. |
| F08 | FAIL | safe_validation_rejection | PASS_FAIL_CLOSED | No | 13.819 s | /api/analyze/leaks: Leak analysis result rejected by output validation: unreported_numeric_unit. |
| F09 | PASS | completed_abstention | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 14.188 s | None |
| F10 | PASS | completed_expected_behavior | PASS_REVIEWED_ACCEPTED_OUTPUTS | Yes | 10.341 s | None |

## Interrupted cases

- F04: Leak HTTP 502, `unreported_number`; diagnostic `scalar_not_in_selected_support`, normalized number `600`, field `leaks[0].interpretation`. Neither selected nor global support contained 600. Safely blocked.
- F07: Evidence HTTP 502, `Evidence authorization atoms have invalid source support.` Diagnostic: `invalid_source_refs`, atom index `2`, field `source_refs`. No Evidence or authorization records published. Safely blocked, not a provider failure.
- F08: Leak HTTP 502, `unreported_numeric_unit`. Accepted Evidence contained no unsupported 9%/5% and no authorization. Rejected text and offending field are not retained, so the specific claim cannot be identified. Safely blocked.

Case 10 completed cleanly: no USD 4 margin, no actionable leak, no authorization, no savings and no action candidate. Case 1 completed with the verified USD 625 Labor impact. Waste Case 5 abstained under the unchanged trusted-purchases policy; no USD 500 savings was fabricated.

## Artifacts and limits

[verification.json](verification.json) records each stage outcome, behavioral/safety classifications, exact available failure diagnostics and review notes. [results.json](results.json) preserves the unchanged end-to-end audit. [source-check.json](source-check.json) and [report-integrity.json](report-integrity.json) verify source, fixture and raw-artifact integrity. Original generated summary/report are retained as `pipeline-summary.json` and `pipeline-report.md`.

Accepted payloads were reviewed against original fixture sources for numeric meaning, source relationships, permissions and calculations. Pre-filter Evidence completions and rejected provider texts are unavailable; no stronger claim about exact rejected prose or live filter-drop events is made. Client-facing timezone is Europe/London; recorded ISO timestamps are UTC.

## F01: Complete calculable Labor — frozen live PASS

**End-to-end:** PASS. **Behavior:** completed_expected_behavior. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 16403 ms.

Golden Labor completed: baseline 4 and worker cost USD 625 were grounded; only the permitted -1-person trial was bound. Deterministic Labor cost changed from USD 2500 to USD 1875, impact USD 625. Gate allowed only the sole verified candidate; Decision followed it.

- **Evidence:** HTTP 200; totals 100000 / 95800 USD; 2 trusted calculation facts; 0 missing-information entries
- **Leak:** HTTP 200; findings: labor (headcount_reduction)
- **Scenario:** HTTP 200; 1 scenarios, 0 non-ready findings
- **Authorization:** headcount_reduction, delta, value -1 persons
- **Calculation:** HTTP 200; calculable: 2500 → 1875; verified impact 625 USD
- **Decision_Gate:** HTTP 200; action_allowed; single_calculable_candidate
- **Decision:** HTTP 200; actionable; business_action; candidate candidate_01

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F01.json](runs/F01.json).

## F02: Labor missing authoritative labor_cost_per_worker

**End-to-end:** PASS. **Behavior:** completed_abstention. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 15941 ms.

Missing authoritative worker cost remained missing. No division of USD 2500 by 4 was used. The permitted scenario reached not_calculable_yet, and Gate/Decision collected worker-cost data. Scenario declared a baseline calculation ID in missing_calculation_inputs despite the baseline being present; the calculator independently identified the actual missing worker cost. This is recorded as a quality observation, not a changed scoring rule.

- **Evidence:** HTTP 200; totals 100000 / 95800 USD; 1 trusted calculation facts; 0 missing-information entries
- **Leak:** HTTP 200; findings: labor (headcount_reduction)
- **Scenario:** HTTP 200; 1 scenarios, 0 non-ready findings
- **Authorization:** headcount_reduction, delta, value -1 persons
- **Calculation:** HTTP 200; not_calculable_yet; calculation null; missing Authoritative labor cost per worker for Tuesday evenings in the affected period and currency
- **Decision_Gate:** HTTP 200; needs_more_data; no_calculable_scenarios
- **Decision:** HTTP 200; needs_more_data; collect_data; candidate none

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F02.json](runs/F02.json).

## F03: Labor missing unchanged-schedule constraint

**End-to-end:** PASS. **Behavior:** completed_abstention. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 18440 ms.

Missing scheduling constraint prevented a complete authorization record. Labor finding remained unbound, no scenario was authorized, and Gate/Decision completed with a non-action data request.

- **Evidence:** HTTP 200; totals 100000 / 95800 USD; 2 trusted calculation facts; 0 missing-information entries
- **Leak:** HTTP 200; findings: labor (unbound)
- **Scenario:** HTTP 200; 0 scenarios, 1 non-ready findings
- **Authorization:** None
- **Calculation:** HTTP 200; no scenarios to calculate
- **Decision_Gate:** HTTP 200; no_actionable_scenario; no_authorized_scenarios
- **Decision:** HTTP 200; needs_more_data; collect_data; candidate none

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F03.json](runs/F03.json).

## F04: Labor with no management permission

**End-to-end:** FAIL. **Behavior:** safe_validation_rejection. **Safety:** PASS_FAIL_CLOSED. **Complete:** false. **Latency:** 8747 ms.

Evidence withheld staffing authorization. Leak was safely rejected for unsupported scalar 600 in leaks[0].interpretation, branch scalar_not_in_selected_support. No downstream stage was reached.

- **Evidence:** HTTP 200; totals 100000 / 95800 USD; 2 trusted calculation facts; 0 missing-information entries
- **Leak:** HTTP 502; Leak analysis result rejected by output validation: unreported_number.
- **Scenario:** Not reached
- **Authorization:** None
- **Calculation:** Not reached
- **Decision_Gate:** Not reached
- **Decision:** Not reached

**First failure:** {"stage":"/api/analyze/leaks","http":502,"reason":"Leak analysis result rejected by output validation: unreported_number.","diagnostics":[{"label":"Backend Leak rejection","diagnostic":{"reason":"unreported_number","rejection_branch":"scalar_not_in_selected_support","normalized_number":"600","field_path":"leaks[0].interpretation","number_in_global_support":false,"number_in_selected_support":false,"selected_citation_count":3,"matching_support_count":0,"global_matching_support_count":0,"numeric_expression_type":"scalar","support_scope":"finding_citations"}}],"details_not_exposed":null}.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":true,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F04.json](runs/F04.json).

## F05: Waste leak

**End-to-end:** PASS. **Behavior:** completed_abstention. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 11224 ms.

Waste finding and explicit 9%-to-5% permission were correctly bound. Purchases were not accepted as a trusted calculator input under current policy. Calculation abstained, and Gate/Decision requested the missing accepted purchases. No USD 500 savings were fabricated.

- **Evidence:** HTTP 200; totals unknown / unknown USD; 0 trusted calculation facts; 4 missing-information entries
- **Leak:** HTTP 200; findings: waste (waste_rate_target)
- **Scenario:** HTTP 200; 1 scenarios, 0 non-ready findings
- **Authorization:** waste_rate_target, absolute_target, value 5 percent
- **Calculation:** HTTP 200; not_calculable_yet; calculation null; missing Authoritative ingredient purchases for the affected period and currency; ingredient cost is not equivalent
- **Decision_Gate:** HTTP 200; needs_more_data; no_calculable_scenarios
- **Decision:** HTTP 200; needs_more_data; collect_data; candidate none

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F05.json](runs/F05.json).

## F06: Delivery leak

**End-to-end:** PASS. **Behavior:** completed_abstention. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 9823 ms.

Supported Delivery loss finding remained unbound because no lever was approved. No scenario, loss total or savings was invented. Gate/Decision completed with non-action.

- **Evidence:** HTTP 200; totals unknown / unknown USD; 0 trusted calculation facts; 4 missing-information entries
- **Leak:** HTTP 200; findings: delivery (unbound)
- **Scenario:** HTTP 200; 0 scenarios, 1 non-ready findings
- **Authorization:** None
- **Calculation:** HTTP 200; no scenarios to calculate
- **Decision_Gate:** HTTP 200; no_actionable_scenario; no_authorized_scenarios
- **Decision:** HTTP 200; needs_more_data; collect_data; candidate none

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F06.json](runs/F06.json).

## F07: Mixed leaks — Waste permission only

**End-to-end:** FAIL. **Behavior:** safe_validation_rejection. **Safety:** PASS_FAIL_CLOSED. **Complete:** false. **Latency:** 7211 ms.

Evidence authorization extraction was rejected before any Evidence envelope or authorization records were published. Exact diagnostic: invalid_source_refs, atom_index 2, failing_field source_refs. This is a safe validation rejection, not a provider/runtime failure.

- **Evidence:** HTTP 502; Evidence authorization atoms have invalid source support.
- **Leak:** Not reached
- **Scenario:** Not reached
- **Authorization:** Not emitted
- **Calculation:** Not reached
- **Decision_Gate:** Not reached
- **Decision:** Not reached

**First failure:** {"stage":"/api/analyze/evidence","http":502,"reason":"Evidence authorization atoms have invalid source support.","diagnostics":[{"label":"Evidence authorization atom rejection","diagnostic":{"reason":"invalid_source_refs","atom_index":2,"failing_field":"source_refs"}}],"details_not_exposed":null}.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":true,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F07.json](runs/F07.json).

## F08: Conflicting source data

**End-to-end:** FAIL. **Behavior:** safe_validation_rejection. **Safety:** PASS_FAIL_CLOSED. **Complete:** false. **Latency:** 13819 ms.

Accepted Evidence preserved both conflicting sales reports and their unresolved status. It contained no unsupported 9%/5% missing-information entry and no authorization. Leak was safely rejected for unreported_numeric_unit. Rejected text and field were not retained, so its precise numeric claim cannot be identified. No downstream stage was reached.

- **Evidence:** HTTP 200; totals unknown / unknown USD; 0 trusted calculation facts; 4 missing-information entries
- **Leak:** HTTP 502; Leak analysis result rejected by output validation: unreported_numeric_unit.
- **Scenario:** Not reached
- **Authorization:** None
- **Calculation:** Not reached
- **Decision_Gate:** Not reached
- **Decision:** Not reached

**First failure:** {"stage":"/api/analyze/leaks","http":502,"reason":"Leak analysis result rejected by output validation: unreported_numeric_unit.","diagnostics":[],"details_not_exposed":"Rejected model text and offending field are not exposed by the current error envelope."}.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":true,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F08.json](runs/F08.json).

## F09: Unsupported numeric bait

**End-to-end:** PASS. **Behavior:** completed_abstention. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 14188 ms.

Numeric bait remained source-described identifiers/history and was not used as monetary Labor input or current totals. No worker-cost fact or arithmetic-derived cost was accepted. The authorized Labor scenario abstained for missing worker cost; Gate/Decision requested data.

- **Evidence:** HTTP 200; totals 100000 / 95800 USD; 1 trusted calculation facts; 0 missing-information entries
- **Leak:** HTTP 200; findings: labor (headcount_reduction)
- **Scenario:** HTTP 200; 1 scenarios, 0 non-ready findings
- **Authorization:** headcount_reduction, delta, value -1 persons
- **Calculation:** HTTP 200; not_calculable_yet; calculation null; missing Authoritative labor cost per worker for Tuesday evenings in the affected period and currency
- **Decision_Gate:** HTTP 200; needs_more_data; no_calculable_scenarios
- **Decision:** HTTP 200; needs_more_data; collect_data; candidate none

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F09.json](runs/F09.json).

## F10: Clean / no actionable leak

**End-to-end:** PASS. **Behavior:** completed_expected_behavior. **Safety:** PASS_REVIEWED_ACCEPTED_OUTPUTS. **Complete:** true. **Latency:** 10341 ms.

Clean control completed with no leak, authorization, scenario or savings. Accepted Leak explanations used reported amounts and waste percentage; no model-derived USD 4 margin appeared. Gate returned no_actionable_scenario; Decision had no action candidate and empty priority inputs.

- **Evidence:** HTTP 200; totals 60000 / 54000 USD; 0 trusted calculation facts; 0 missing-information entries
- **Leak:** HTTP 200; findings: none
- **Scenario:** HTTP 200; 0 scenarios, 0 non-ready findings
- **Authorization:** None
- **Calculation:** HTTP 200; no scenarios to calculate
- **Decision_Gate:** HTTP 200; no_actionable_scenario; no_authorized_scenarios
- **Decision:** HTTP 200; needs_more_data; collect_data; candidate none

**First failure:** None.
**Provider/runtime:** {"provider_failure_observed":false,"runtime_failure_observed":false,"validation_rejection":false,"not_reached_stages_not_assessed":true}.
**Safety violations:** [].
**Artifact:** [runs/F10.json](runs/F10.json).
