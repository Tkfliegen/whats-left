# J09 Leak word-form ratio validation

## Scope and files

Production change: **`src/app/api/analyze/leaks/output.ts` only**. New regression file: `tests/leak-word-ratios.test.mjs`. This directory stores the single live submission, source/model/payload checks and report. No other production files or existing tests changed.

## Patterns and normalization

The new layer recognizes clear quantitative constructions, case-insensitively:

- `one` through `ten` followed by `times` and a financial measure/comparison anchor (for example, `four times the revenue`, `three times higher`).
- Word-number `fold` forms, joined or separated by a space/hyphen, followed by a measure/comparison (`threefold increase`, `three-fold increase`, `three fold increase`).
- `twice`, `double`, `triple`, `half` followed by a measure/comparison (`twice the revenue`, `double the cost`, `triple the amount`, `half the revenue`, `half of the revenue`).

The finite anchor vocabulary is revenue, sales, cost(s), expense(s), amount, profit, income, fees, rate, volume, output, price, wages, staffing, headcount, baseline, target, increase, decrease, growth, reduction, higher, lower, greater, more, less, and as much/many. Optional short determiners/of are recognized. Qualifiers `over`, `under`, `more than`, `less than`, `at least`, `at most`, `about`, `approximately`, `nearly`, `almost`, `exactly`, `up to` remain distinct in the canonical claim. Direct `not`/`never` prefixes remain distinct too.

Validation-only mappings: one–ten→1–10; twice/double→2; triple→3; half→0.5. A canonical claim retains the qualifier, factor, times/fold construction and measure/comparison anchor. Articles, case and spacing/hyphenation are normalized only for comparison. Source digit-form ratio expressions can supply an explicit equivalent claim, such as source `2 times the revenue` supporting output `twice the revenue`. This does not relax existing digit checks in output.

A bare source scalar4, four staff, or component values1650/6800 do not supply a four-times claim. No ratios are calculated. Numeric word occurrences outside the targeted constructions are not generalized into numbers. Ordinary `double-check`, `double espresso`, `half-day`, and review-frequency prose remain unaffected. This is a finite syntactic guard, not general English-number parsing, semantic entailment or generalized provenance.

## Grounding and rejection

Reference/completeness validation remains first. Existing digit and percent/percentage-point checks run unchanged. The new layer then compares word-form claims against explicit claim representations in the **same existing cited source set** used by the field. Insufficient-evidence entries retain their existing global-catalog support rule; no source pool is enlarged.

Unsupported claims reject through the existing `unreported_number` path with the normalized multiplier and exact field. For saved J09:

```json
{"ok":false,"reason":"unreported_number","field":"leaks[0].interpretation","numbers":["4"]}
```

The existing route returns HTTP502 and its existing generic output-validation error. Existing development diagnostics retain only path/reason/normalized number. No prose rewrite, silent deletion, citation recovery, binding change, retry or fallback occurs. The binding resolver is still reached only after output validation succeeds.

## Regression coverage and verification

43 new tests cover every requested phrase; one–ten times/fold vocabulary; source-supported normalization; component numbers not authorizing ratios; uncited ratios; distinct qualifiers/measures; direct negation; all existing numeric-grounded text surfaces; ordinary non-ratio uses; existing digit checks and reference-first ordering; exact saved J09 rejection; unchanged trusted binding resolution; a source-reported but uncited J11-style3100 rejection; and real route502 rejection of the saved J09 completion without provider retry/prose mutation.

- Focused new/output/route/backend diagnostic/citation tests: **94/94 pass**.
- Full suite: **831/831 pass**.
- ESLint: pass.
- TypeScript `tsc --noEmit`: pass.
- Production build `next build --webpack`: pass.

Existing citation completeness, authorization and binding regressions remain green. The exact old accepted output is the deterministic proof of the J09 fix, not a stochastic fresh completion.

## One live J09 production-path run

Exactly the saved J09 note, unchanged current models/providers and normal browser app flow, one submission. No retries, repairs, fallback or full twelve-case suite.

**No word-form quantitative ratio appeared in this fresh response.** Leak validation passed, frontend reached **Complete**, and total end-to-end latency was **12.902s**. No first failing stage or new validation issue was observed. This smoke run demonstrates compatibility; it does not prove the rejection branch was exercised live.

Exact accepted Labor title:

> Tuesday late sitting labor cost exceeds revenue with same staffing as higher-revenue Friday

Exact evidence prose:

> The Tuesday late sitting (6 PM–10 PM) generated USD 1,650 in revenue while incurring USD 2,750 in wages with 5 staff on duty.

> Friday evenings generated USD 6,800 in revenue with the same staffing level of 5 people on duty.

> The owner authorized a trial removing 1 person from the Tuesday sitting roster while keeping the rest of the weekly rota unchanged.

Exact interpretation:

> Tuesday evenings used 5 staff, generated USD 1,650 in sales, and incurred USD 2,750 in staffing cost for the monthly period. Friday evenings used the same staffing level of 5 but generated USD 6,800 in sales. The owner has authorized a trial reducing Tuesday staffing by 1 person with no changes to other shifts.

The full Leak response, including insufficient-evidence prose and citation IDs, is retained in `live/runs/J09.json`. All cited numeric claims remained source-supported. Labor resolves to `headcount_reduction`, with explicit−1 person authorization and unchanged schedule. Scenario retains that exact authorized change. Simulation returns `not_calculable_yet`; Gate returns `needs_more_data`; Decision returns `collect_data` with no selected candidate and no fabricated savings.

| Stage | HTTP | Browser round-trip latency |
| evidence | 200 | 3.474s |
| leaks | 200 | 2.537s |
| scenarios | 200 | 1.564s |
| simulate | 200 | 0.034s |
| decision-gate | 200 | 0.054s |
| decision | 200 | 1.748s |

## Scope confirmation

All42 production source files were checked against the final combined evaluation manifest. Only Leak output validation differs; no source changed during the live run. Evidence (including total support), currency parser, prompts/schemas, Scenario, authorization, binding, calculator, Gate, Decision, frontend, models, providers and timeout settings are unchanged. Exactly one saved-payload submission; no retries/repairs/fallbacks or unrelated production changes.
