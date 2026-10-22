# Case A isolated Leak reliability diagnosis

Five new calls to `nvidia/Nemotron-3_5-Lightning`, using the exact saved successful Ultra Evidence output and operational context. The unchanged production Leak handler generated every request and decided acceptance. No Evidence or downstream agent was called. Provider settings, timeout, prompt, schema and validators were unchanged. These were five planned independent observations, with no automatic retry, repair or fallback.

## Original smoke run: retention limit

The original smoke artifact retained only HTTP 502 and `unreported_number`, `leaks[1].evidence[1]`, normalized `4`. The rejected completion, finding identity, evidence sentence and returned refs were not retained. Its exact historical output therefore cannot be reconstructed. Reproductions below match that diagnostic but do not prove the original sentence was identical.

## Five-run results

All five provider calls returned HTTP 200, parsed successfully and passed structural/reference validation. Route status below is the real unchanged POST handler Response status, executed in isolation rather than through a running HTTP server.

| Run | Provider / route HTTP | Result | First rejected field | Number | Cited fact suffixes at rejection | Provider latency |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 200 / 502 | FAIL | leaks[1].evidence[1] | 4 | 12, 14, 16 | 19.002s |
| 2 | 200 / 502 | FAIL | leaks[1].evidence[1] | 4 | 12, 14, 16 | 16.388s |
| 3 | 200 / 502 | FAIL | leaks[0].interpretation | 4 | 17, 18, 19 | 22.296s |
| 4 | 200 / 200 | PASS | — | — | — | 22.820s |
| 5 | 200 / 200 | PASS | — | — | — | 22.060s |

Mean provider latency: 20.513s; maximum: 22.820s. No provider errors or timeouts. Exact per-run handler latency, IDs, offending excerpts and findings are in [results.json](results.json). All five upstream request bodies have SHA-256 `2e2bfc403ced4cb12da729e7a38df5a2455b043cac9ffe3933b8e7b689f44255`.

## Where 4 came from in the reproductions

Runs 1 and 2: `leaks[1]` is Labor, bound to `headcount_reduction`. Exact `evidence[1]`:

> During that Tuesday evening period, we normally scheduled 4 staff members.

Finding titles respectively:
- Tuesday evening staffing may be higher than necessary
- Tuesday evening staffing exceeds operational need

Refs are at finding level; evidence items have no separate refs. Both findings returned exactly:

- `fact_abbca75924f4c231a119ad1248d351f3_12`
- `fact_abbca75924f4c231a119ad1248d351f3_14`
- `fact_abbca75924f4c231a119ad1248d351f3_16`

These resolve to source IDs with the same namespace and suffixes 12, 14, 16. Their permitted normalized numeric tokens are `6`, `10`, `1900`, `2500`, `625`, `1`. They do not contain `4`.

The quoted staffing sentence is source-reported in `fact_abbca75924f4c231a119ad1248d351f3_13`, source `src_abbca75924f4c231a119ad1248d351f3_13`. Fact 24 also includes that staffing source; fact 15 contains the Friday staffing count of 4. None was cited in runs 1–2. Classification: **source-reported but uncited**, not invented arithmetic or a parser bug. Both interpretations also repeat uncited `4`; the real validator stops at the evidence item first.

The complete required intervention support group (12/14/16) was present, so structural validation correctly passed. That minimum group establishes the intervention; it does not authorize extra narrative numbers from uncited optional facts. Runs 3–5 cite fact 13 for the Labor count; run 5 additionally cites 15 for Friday comparisons.

Run 3: Waste `leaks[0].interpretation` instead says:

> The business is exceeding its own waste target by 4 percentage points, indicating avoidable loss in the waste-tracked ingredient category.

It cites facts 17/18/19 (same namespace), resolving to sources 17/18/19. Permitted tokens: `9`, `5`, `12500`. The `4 percentage points` claim is **model-derived arithmetic**, consistent with 9 minus 5. It is mathematically correct but not source-reported and therefore forbidden by the existing contract. Unrelated staffing facts containing 4 do not support this Waste claim.

No evidence suggests formatting, array indexes, fact-ID digits or time-range parsing generated the rejected token. The guard extracts existing digit strings; it does not calculate four hours from 6–10 PM. Offline regression tests cover those distinctions.

## Reliability conclusion

- 2 PASS / 3 FAIL: 40% full validation pass rate in this small, single-input sample.
- Unreported `4`: 3/5 runs (60%). Exact original field path: 2/5 (40%).
- Uncited staffing count: 2/5; derived Waste difference: 1/5.
- No other unsupported numeric values appeared in the diagnostic inventory, including fields after the first rejected location.
- All five runs identified the same three qualitative issues: Tuesday staffing, waste above internal target, and some delivery orders costing more than revenue. Wording and citation selection varied. This consistency does not establish that excess staffing or avoidable waste is causally proven.
- Labor binding remained `headcount_reduction`; Waste and Delivery remained unbound in all runs.

This is a recurrent stochastic generation/citation problem for this input, rather than a one-off failure. Five calls on one note cannot establish the failure rate across other businesses. The existing validator behaved correctly and consistently: it rejected uncited numeric claims and forbidden derived arithmetic, while accepting properly cited source numbers. There is no concrete evidence for a validator bug.

**Recommendation B: focused Leak prompt hardening**, followed by an offline check and controlled reliability evaluation before any deployment. Address the minimum required support group versus all facts actually used in prose, and source-reported percentages versus calculated differences. Do not infer or repair refs and do not weaken validation. This recommendation has not been implemented.

## Changes and verification

Added only an isolated evaluation harness, six offline harness tests and evaluation artifacts. No production file was edited. The harness uses the existing route and validators as acceptance authority; its additional numeric inventory is diagnostic only.

- Focused Leak/harness tests: 56 passed.
- Full suite: 712 passed.
- ESLint: passed.
- All 39 `src` file hashes match the pre-evaluation manifest; [source-check.json](source-check.json) reports no changes.
- No raw provider envelope, authentication headers or credentials are saved. Results retain finding summaries and offending excerpts needed for this diagnosis; input.json contains the exact user-authorized saved business input.
- Exactly five live Leak calls; zero downstream calls, retries, repairs or fallbacks. No production behavior changes.
