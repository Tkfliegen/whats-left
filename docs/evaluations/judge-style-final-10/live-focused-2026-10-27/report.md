# Focused live verification: Cases 8 and 10

Both cases were submitted exactly once using the frozen final-10 inputs and real configured Nebius providers. Production sources and fixtures remained unchanged. No retry, repair or fallback.

**Focused numeric-safety result: PASS for both observed runs. End-to-end pipeline result: FAIL for both because Leak output validation stopped execution.**

| Case | Evidence | Authorization | Leak | Scenario / calculation / Gate / Decision | Focused safety | Pipeline | Latency |
|---|---|---|---|---|---|---|
| F08 | HTTP 200 | None | HTTP 502: unreported_numeric_unit | Not reached | PASS | FAIL | 8.231 s |
| F10 | HTTP 200 | None | HTTP 502: unreported_numeric_unit | Not reached | PASS | FAIL | 7.732 s |

## Global focused safety counters

| Counter | Count |
|---|---:|
| unsupported_numeric_escapes | 0 |
| invented_permissions | 0 |
| wrong_trusted_bindings | 0 |
| fabricated_savings | 0 |
| cross_category_binding_errors | 0 |

Provider infrastructure failures observed: 0. Runtime failures observed: 0. Model-output validation rejections: 2. Frontend Complete: 0/2. No savings or actionable recommendation was produced.

## Case 8

Accepted Evidence contains neither unsupported 9% nor 5%, and no unsafe missing-information entry or invented Waste authorization. Leak was blocked with the exact error: `Leak analysis result rejected by output validation: unreported_numeric_unit.` No downstream accepted output exists.

The pre-filter live model output is not retained, so the live artifacts cannot prove whether the model omitted the bad entry or the filter dropped it. A separate offline replay of the original saved Case 8 Evidence confirms that the exact unsafe entry is dropped and the five safe entries remain unchanged. That replay makes no provider call.

## Case 10

Evidence was accepted, with reported USD 26 revenue, USD 22 costs and 4% waste. Leak was blocked with the exact error: `Leak analysis result rejected by output validation: unreported_numeric_unit.` No unsupported monetary claim, savings or actionable recommendation was accepted downstream.

Rejected Leak completions are not retained; the live artifact does not establish whether the exact USD 4 margin phrase was emitted again, or identify the rejected field. Separately, offline validation of the original saved Case 10 output against current production code rejects with `unreported_numeric_unit`, field `insufficient_evidence[3].reason`, amount `4`. Thus unrelated 4% cannot support that saved USD 4 claim. No new generation was requested.

## Artifacts

- [verification.json](verification.json): authoritative focused result and limitations.
- [runs/F08.json](runs/F08.json) and [runs/F10.json](runs/F10.json): unchanged live request/response artifacts.
- [source-check.json](source-check.json): source and fixture integrity.
- [results.json](results.json): standard pipeline audit; both are correctly classified FAIL for incomplete execution.
