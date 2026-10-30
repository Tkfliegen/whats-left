# Retirement migration validation — 2026-10-30

READY_FOR_PRODUCTION_MIGRATION: YES

Decision inference and observability, and Leak final fallback now use `nvidia/Nemotron-3-Ultra-550b-a55b`. Existing configured Nebius catalog availability and live Decision compatibility were verified. Evidence/Leak primary stay Ultra; Scenario stays `nvidia/Nemotron-3_5-Lightning`. No prompts, schemas, validator behavior, calculators, authorization, Gate rules, retry rules, token limits, thinking flags or timeouts changed.

## Required local validation

- Full suite: 1377/1377 passed.
- Focused Decision + Leak suites: 562/562 passed.
- TypeScript (`npx tsc --noEmit`): passed.
- Lint (`npm run lint`): passed.
- Production build (`npm run build -- --webpack`): passed, exit 0. The bundled Next.js CLI documentation supports this flag. Earlier Turbopack worker port-binding failure is an environment limitation; no application workaround was added.
- Frozen F01 Golden Labor: all six production handlers passed live, sequential integration, no mocked responses or repeat submissions. Evidence 200 / 6998 ms; Leak 200 / 4061 ms; Scenario 200 / 1903 ms; Calculator 200 / 37 ms; Gate 200 / 21 ms; Decision 200 / 1063 ms. This is handler-level integration in the existing test loader, not browser/Next HTTP verification.
- Gate action_allowed, headcount 4 plus authorized delta -1 gives 3; labor USD 2500 baseline, USD 1875 projected, USD 625 reduction for the monthly reporting period (serialized last month). Unchanged production Decision validator accepted the result. No unsupported quantitative claim observed. Tests preserve schema and authorization rejection boundaries.
- Earlier baseline Leak failure remains documented in the previous local report; final required run completed without that failure.

Raw local synthetic outputs and logs remain in `/tmp/whats-left-migration/`. Production status will be reported after the authorized commit/push/deployment verification.

## Remaining retiring-model occurrence classification

ACTIVE_RUNTIME: 0. TEST_EXPECTATION: 0. DOCUMENTATION_CURRENT: 0. All occurrences below are HISTORICAL_RECORD. The isolated Evidence A/B script retains its explicit historical Super comparator; it is not imported by application runtime. Historical reports/manifests and the prior migration attempt report are unchanged. This inventory includes ignored historical artifacts present locally.

| Classification | File | Line |
|---|---|---|
| HISTORICAL_RECORD | `./scripts/evaluation/evidence-ab/evaluate.mjs` | 20 |
| HISTORICAL_RECORD | `./docs/evaluations/leak-ultra-switch/report.md` | 37 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-acceptance/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/j05-currency-fix/live/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-acceptance/report.md` | 13 |
| HISTORICAL_RECORD | `./docs/evaluations/j05-currency-fix/live/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-acceptance/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/manifest.json` | 5 |
| HISTORICAL_RECORD | `./docs/evaluations/scenario-abstention-ownership/targeted/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 5 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 157 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 439 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 701 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 963 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 1158 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 1403 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 1735 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 1876 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 2197 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 2479 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 2741 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 3003 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 3198 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 3443 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 3775 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/results.json` | 3916 |
| HISTORICAL_RECORD | `./docs/evaluations/scenario-abstention-ownership/targeted/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/evidence-super-ultra/report.md` | 5 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 44 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 45 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 46 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 47 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 48 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 49 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 50 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 51 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 52 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 53 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 54 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 55 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 56 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 57 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 58 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 59 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 60 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 61 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 62 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 63 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 64 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 65 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 66 |
| HISTORICAL_RECORD | `./docs/evaluations/decision-ultra-migration/report.md` | 67 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/grounding-diagnosis.md` | 210 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 54 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 571 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 991 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 1374 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 1612 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 1744 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 2058 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 2736 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 2924 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 3450 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 3626 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/results.json` | 3867 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-full-pipeline/report.md` | 23 |
| HISTORICAL_RECORD | `./docs/evaluations/scenario-abstention-ownership/full/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/j09-word-ratio-fix/live/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/j09-word-ratio-fix/live/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/scenario-abstention-ownership/full/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-combined/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-combined/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-10/live-2026-10-26/manifest.json` | 8 |
| HISTORICAL_RECORD | `./docs/evaluations/j02-business-total-fix/live/source-check.json` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/j02-business-total-fix/live/manifest.json` | 7 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-combined/report.md` | 9 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-10/live-focused-2026-10-27/manifest.json` | 8 |
| HISTORICAL_RECORD | `./docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/manifest.json` | 8 |
