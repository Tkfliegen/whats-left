# Blocker-fix verification — 21 October 2026

## Result

The two code fixes are implemented and covered locally. Fresh live sign-off is
**not established**: the single approved Cornhead attempt stopped at the unchanged
Evidence endpoint with HTTP 502 after 60.146 seconds (request duration 60.111 s).
Its safe server error was “Evidence provider is unavailable or returned an
invalid response.” The duration is consistent with the existing 60-second
provider timeout, but the generic response does not establish the exact upstream
cause. No retry, output repair, validator relaxation or model change was made.

Leak, Scenario, Simulation, Gate and Decision were never called. The UI kept
Complete false, Evidence stopped, and later agents idle. There is no fresh Leak
output or source-reference mismatch to report from this attempt. Previous live
artifacts were preserved separately.

## Local verification

The recorded problematic finding was tested with category `operations`, title
“Tuesday evening staffing cost exceeds sales revenue”, and these citations:

- Tuesday evenings from 6 PM to 10 PM average only $1,900 in monthly sales.
- Staffing during those hours costs $3,080 per month.

It now binds to `tuesday_evening_headcount_reduction` through the authoritative
operational source and exact permission, with both refs required in Scenario
output. Waste remains `ingredient_waste_rate_target` at 9 → 5. Delivery has no
authorization. Title/category variations do not change those identities.

A local integration test exercises the real Evidence, Scenario, Calculator,
Gate and Decision routes with provider fixtures and the recorded Labor variant.
Labor and Waste are authorized, both calculations need real missing inputs,
Delivery remains not simulation-ready, the Gate has no top candidate, and the
Decision is collect-data with candidate-neutral natural-language rationale.
Currency remains USD. This is local route integration, **not a second live run**.

Unknown/unrelated citations, partial Labor evidence, missing exact permission,
forged source mappings, competing identity matches and missing required Scenario
refs fail closed. The old title/category dependency has not been replaced with
fuzzy matching or another model.

Decision tests reject candidate/scenario threshold claims, null-top-candidate
references and raw enum prose in all four free-text field families, returning
explicit 502 with one provider call and no mutation. Exact authorized candidate
references remain allowed for a supplied top candidate; comparison-gap language
and explicit candidate-absence statements remain allowed. Existing financial,
unsupported-consequence and Gate compliance tests remain active.

## Verification checks

- Focused Authorization, Scenario route, Decision, Gate and currency/local-route
  integration: 345 passed.
- Full suite: 477 passed.
- Lint: passed without warnings.
- Standalone TypeScript: passed.
- Webpack production build: passed, including production type checking.
- Default Turbopack was not rerun in this pass; its previously observed sandbox
  worker-port restriction remains a separate environment limitation.

Production frontend, shared output contracts, Calculator formulas, Gate policy
and threshold, model assignments, and request sequencing remain unchanged.
Only the source-binding adapter, narrow prose guards and supporting prompt
constraints changed. Existing historical demo reports remain historical; they
are not rewritten to imply this live attempt succeeded.

## Remaining sign-off requirement

A new explicitly authorized live run is needed once Evidence/provider service
responds successfully. This attempt cannot confirm fresh live Labor/Waste
binding or Decision output. Unrecognized source/citation formats still fail
closed by design and would require an explicit tested extension rather than
silent matching or repair.
