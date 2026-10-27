# Final engineering pre-commit audit

Scope: frozen safety/observability engineering changes only. No production behavior edits, provider calls, live reruns, commits before audit completion, or pushes during this audit.

## Inclusion decisions

Unrelated artwork, branding, visual icons, background geometry, styles and their tests remain local. Two mixed files are staged by content: dashboard form lifecycle/source-summary integration and the corresponding frontend test location change; their visual hunks are excluded. The working copies are unchanged.

The ordinary git diff contains pre-existing engineering changes (including approved extraction prompts and diagnostics); this audit does not introduce further production behavior changes.

The development diagnostics are retained intentionally: development-only calculation presence/rejection counters and source-support metadata; existing numeric rejection details; LangSmith diagnostics restricted to allowlisted error names/codes, HTTP status, stage and operation. No credentials, raw provider completions, arbitrary exception messages or source prose are uploaded to LangSmith. Existing business-total diagnostics remain development-only.

Synthetic terminal validation runs and canonical acceptance results are reviewable fixtures, not temporary debug dumps. All inflight snapshots are excluded. Completion regression tests use the canonical terminal artifact and completion-review.json; they do not require temporary inflight dumps. Superseded reports, copied runner/auditor dumps, and duplicate frozen-input copies remain local. Existing reports may mention these locally retained intermediate artifacts.

Live-run manifests record the evaluated working tree, including unrelated visual work that is excluded from this engineering commit. Therefore an isolated staged-tree verification is also performed; the frozen live-run hashes are preserved without rewriting.

## Original modified/untracked inventory

```text
 M .gitignore
 M docs/integrations.md
 M next.config.ts
 M scripts/evaluation/evidence-ab/evaluate.mjs
 M src/app/api/analyze/evidence/evidence.ts
 M src/app/api/analyze/evidence/provenance.ts
 M src/app/api/analyze/evidence/route.ts
 M src/app/api/analyze/leaks/leaks.ts
 M src/app/api/analyze/leaks/output.ts
 M src/app/api/analyze/leaks/route.ts
 M src/app/api/analyze/scenarios/route.ts
 M src/app/api/analyze/simulate/route.ts
 M src/app/globals.css
 M src/components/dashboard.tsx
 M src/components/decision-panel.tsx
 M src/components/scenario-panel.tsx
 M src/components/use-background-regions.ts
 M src/components/use-demo-analysis.ts
 M src/lib/observability/langsmith.ts
 M src/lib/scenario-calculator.ts
 M src/types/evidence.ts
 M tests/decision-frontend.test.mjs
 M tests/evidence-ab-evaluation.test.mjs
 M tests/evidence-lightning-evaluation.test.mjs
 M tests/leak-backend-diagnostic.test.mjs
 M tests/leak-display.test.mjs
 M tests/leak-prompt-hardening.test.mjs
 M tests/observability.test.mjs
 M tests/scenario-display.test.mjs
?? docs/evaluations/judge-style-final-10/
?? pic/what is left icon-01.png
?? pic/what is left icon-02.png
?? pic/what is left-03.png
?? pic/what is left-04.png
?? pic/what is left-05.png
?? pic/what is left-06.png
?? pic/what is left-07.png
?? pic/what is left-hero.png
?? pic/what is left-section-decision.png
?? pic/what is left-section-scenario.png
?? scripts/evaluation/judge-final-10/
?? src/app/api/analyze/evidence/calculation-facts.ts
?? src/app/api/analyze/evidence/missing-information.ts
?? src/components/business-input-panel.tsx
?? src/components/leak-category-icon.tsx
?? src/components/section-icon.tsx
?? src/lib/analysis-source.ts
?? src/lib/background-regions.ts
?? src/lib/leak-category-icons.ts
?? tests/background-regions.test.mjs
?? tests/brand-header.test.mjs
?? tests/evidence-missing-information.test.mjs
?? tests/helpers/leak-category-icons.mjs
?? tests/input-lifecycle.test.mjs
?? tests/judge-final-10-evaluation.test.mjs
?? tests/labor-calculation-facts.test.mjs
?? tests/leak-category-icons.test.mjs
?? tests/leak-monetary-support.test.mjs
?? tests/section-icons.test.mjs
```

Ignored validation files selected explicitly are listed below; git status normally hides them.

## Final files to commit, by purpose

### LangSmith/observability

- `docs/integrations.md`
- `src/lib/observability/langsmith.ts`
- `tests/observability.test.mjs`

### Local dev/form fix

- `next.config.ts`
- `src/components/business-input-panel.tsx`
- `src/lib/analysis-source.ts`
- `src/components/use-demo-analysis.ts`
- `tests/input-lifecycle.test.mjs`
- `src/components/dashboard.tsx` — engineering hunks only
- `tests/decision-frontend.test.mjs` — engineering hunks only

### Labor calculation-fact producer/binding

- `src/app/api/analyze/evidence/calculation-facts.ts`
- `src/app/api/analyze/evidence/evidence.ts`
- `src/app/api/analyze/evidence/provenance.ts`
- `src/app/api/analyze/evidence/route.ts`
- `src/app/api/analyze/scenarios/route.ts`
- `src/app/api/analyze/simulate/route.ts`
- `src/lib/scenario-calculator.ts`
- `src/types/evidence.ts`
- `scripts/evaluation/evidence-ab/evaluate.mjs`
- `tests/labor-calculation-facts.test.mjs`
- `tests/evidence-ab-evaluation.test.mjs`
- `tests/evidence-lightning-evaluation.test.mjs`

### Evidence missing_information numeric grounding

- `src/app/api/analyze/evidence/missing-information.ts`
- `tests/evidence-missing-information.test.mjs`

### Leak monetary/unit grounding

- `src/app/api/analyze/leaks/leaks.ts`
- `src/app/api/analyze/leaks/output.ts`
- `src/app/api/analyze/leaks/route.ts`
- `tests/leak-backend-diagnostic.test.mjs`
- `tests/leak-prompt-hardening.test.mjs`
- `tests/leak-monetary-support.test.mjs`

### Final judge-style validation fixtures/reports/tests

- `tests/judge-final-10-evaluation.test.mjs`
- `scripts/evaluation/judge-final-10/audit.mjs`
- `scripts/evaluation/judge-final-10/focused.mjs`
- `scripts/evaluation/judge-final-10/review.mjs`
- `scripts/evaluation/judge-final-10/run.mjs`
- `docs/evaluations/judge-style-final-10/F01-frozen-input.txt`
- `docs/evaluations/judge-style-final-10/cases.json`
- `docs/evaluations/judge-style-final-10/cases.md`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/approved-cases.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/completion-review.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/manifest.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/report.md`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/results.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F01.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F02.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F03.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F04.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F05.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F06.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F07.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F08.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F09.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F10.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/semantic-review.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/source-check.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/submitted.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/summary.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/approved-cases.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/manifest.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/report.md`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/results.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/runs/F08.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/runs/F10.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/source-check.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/submitted.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/summary.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/verification.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/approved-cases.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/manifest.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/report-integrity.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/report.md`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/results.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F01.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F02.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F03.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F04.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F05.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F06.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F07.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F08.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F09.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F10.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/source-check.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/submitted.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/summary.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/verification.json`
- `docs/pre-commit-engineering-audit.md`

The Evidence route is shared by the Labor producer and missing-information filter; it is listed once under Labor. Calculator changes are trusted-input identity validation only; formulas are unchanged.

## Intentionally excluded working-tree files

- `.gitignore`
- `src/app/globals.css`
- `src/components/decision-panel.tsx`
- `src/components/scenario-panel.tsx`
- `src/components/use-background-regions.ts`
- `tests/leak-display.test.mjs`
- `tests/scenario-display.test.mjs`
- `pic/what is left icon-01.png`
- `pic/what is left icon-02.png`
- `pic/what is left-03.png`
- `pic/what is left-04.png`
- `pic/what is left-05.png`
- `pic/what is left-06.png`
- `pic/what is left-07.png`
- `pic/what is left-hero.png`
- `pic/what is left-section-decision.png`
- `pic/what is left-section-scenario.png`
- `src/components/leak-category-icon.tsx`
- `src/components/section-icon.tsx`
- `src/lib/background-regions.ts`
- `src/lib/leak-category-icons.ts`
- `tests/background-regions.test.mjs`
- `tests/brand-header.test.mjs`
- `tests/helpers/leak-category-icons.mjs`
- `tests/leak-category-icons.test.mjs`
- `tests/section-icons.test.mjs`

Also excluded: visual hunks in `src/components/dashboard.tsx` and `tests/decision-frontend.test.mjs`.

## Intentionally excluded local validation intermediates

- `docs/evaluations/judge-style-final-10/live-2026-10-26/F01-frozen-input.txt`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/audit-used.mjs`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/before-completion-review-report.md`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/before-completion-review-results.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/before-completion-review-summary.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/review-integrity.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runner-used.mjs`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F01.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F03.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F04.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F05.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F06.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F07.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F08.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F09.inflight.json`
- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F10.inflight.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/F01-frozen-input.txt`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/pipeline-report.md`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/runs/F08.inflight.json`
- `docs/evaluations/judge-style-final-10/live-focused-2026-10-27/runs/F10.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/F01-frozen-input.txt`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/pipeline-report.md`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/pipeline-summary.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F01.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F02.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F03.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F04.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F05.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F06.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F07.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F08.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F09.inflight.json`
- `docs/evaluations/judge-style-final-10/live-post-p0-2026-10-27/runs/F10.inflight.json`

- `docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F02.inflight.json`

Ignored environment files, node_modules, .next, generated Next typings, TypeScript caches and /tmp logs are not staged.

## Audit and verification results

- Final selected scope: 87 files; the complete list above is the staging allowlist.
- Working tree focused regressions: 294 passed.
- Working tree full suite: 1,144 passed.
- Working tree lint: passed.
- Working tree TypeScript (`tsc --noEmit --incremental false`): passed.
- Working tree production Webpack build: passed.
- Isolated engineering-only staged snapshot full suite: 1,112 passed; 32 visual-only tests are intentionally absent.
- Isolated staged snapshot lint, TypeScript and production Webpack build: passed.
- Final fixture-selection check removes all inflight snapshots; no regression depends on them.
- Credential scan: no configured secret values, private-key patterns, service-token patterns or local-only absolute path references found in the selected contents. Test placeholder credentials are synthetic.
- Environment files, artwork, /tmp logs, build caches, temporary snapshots, superseded reports and copied debug scripts are excluded.
- Frozen production source files/configuration are byte-for-byte unchanged by this audit.
- Development diagnostics remain as audited above; none were silently removed.
- No provider calls, production behavior edits, automatic live retries or pushes were performed.

The staged dashboard/frontend-test contents differ from their current working copies only to exclude unrelated visual hunks. The commit will leave those visual changes intact and uncommitted.

Proposed commit message: `Harden numeric grounding and observability safety`.
