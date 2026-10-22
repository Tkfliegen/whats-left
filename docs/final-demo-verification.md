# Final demo verification — 21 October 2026

The production backend and all architectural boundaries are unchanged. This is
an observed verification report, not an unqualified demo-readiness approval.
No failed response was repaired and neither live run was repeated.

## Live Cornhead Bagel

One full browser analysis used the existing Cornhead notes plus the explicit
source field `Currency: USD`. Evidence, Leaks, Scenario, Simulation, Gate and
Decision all returned HTTP 200. Total app latency (submission through Complete)
was **16.91 seconds**. USD remained canonical; no missing currency-code input
appeared. The exact Gate response was passed to Decision unchanged.

The final Decision was `needs_more_data`, `collect_data`, candidate null. It
covered Waste, Labor and Delivery without financial amounts or a fake winner.
Waste was authorized at 9% → 5%, then remained not calculable because ingredient
purchases are missing. Delivery remained not simulation-ready.

**Requested expectation not met:** Labor also remained not simulation-ready.
The live Leak result used category `operations` and the title “Tuesday evening
staffing cost exceeds sales revenue”. The strict existing authorization binding
requires category `labor` and one of its explicit title aliases. Therefore the
supplied headcount permission did not produce the expected -1 Labor scenario.
No fuzzy matching, validator change, recategorization or hidden repair was added.
The returned rationale also says “top candidate” despite Gate top_candidate_id
being null, and includes the raw enum `needs_more_data`. These are backend
free-text precision issues, not a selected action candidate. The frontend
preserves the response verbatim. This prevents claiming the requested Labor/Waste/Delivery scenario split is
reliable in the live app. The exact failed-expectation case is covered by a test
that preserves the current fail-closed boundary.

## Synthetic complete fixtures

Both fixtures are separate from Cornhead and use the existing structured
`calculation_inputs.*` contract. Production Scenario authorization checks the
fixture changes; production formulas and Gate generate the results. Expected
values in the fixtures are assertions, not inputs to production calculation.

| Variant | Labor baseline → projected / reduction | Waste baseline → projected / reduction | Gate |
| --- | --- | --- | --- |
| Close call | USD 3,080 → 2,310 / 770 | USD 1,800 → 1,000 / 800 | needs_more_data |
| Clear winner | USD 10,000 → 7,500 / 2,500 | USD 1,125 → 625 / 500 | action_allowed |

For the clear-winner browser run, Evidence/Leak/Scenario responses were clearly
marked local fixtures. The existing production hook then called the real
Simulation, Gate and Decision endpoints. All three returned 200; total UI latency
was **7.00 seconds** including normal handoffs. Nemotron 3 Super made one real
provider response: `actionable`, `business_action`, `candidate_01`, title
“Test Tuesday evening headcount”, high confidence. Complete followed Decision
success only. The exact Gate response was passed through unchanged.

**Wording issue:** Super's actual rationale was “Top candidate meets threshold
and has highest verified impact.” The current wording guard accepted this
candidate-subject variant. It should refer explicitly to the comparison gap.
The UI displays the response verbatim; it neither introduces nor repairs this
wording. No guard, prompt or architecture was changed in this polish task.

The prose-input form currently has no transport for structured numeric
calculation facts. Therefore the actionable demo enters at the supported
structured fixture boundary; it is not a claim that complete notes alone now
produce calculable scenarios through live extraction. Both modes reuse the same
production Calculator, Gate, Decision validation and rendering code. There is no
production frontend demo branch.

## Presentation and browser verification

- Valid needs-more-data conclusion → Why → Priority inputs → Scenario comparison.
- Action recommendation → rationale → verified comparison → conclusion confidence.
- Scenario-defined and missing-controllable-input states use separate friendly labels.
- Judge copy: AI interprets business evidence. Code verifies scenarios and
  calculates impact. AI recommends within verified boundaries.
- Footer: AI analysis with deterministic validation, scenario calculations, and
  bounded decision support.
- Removed hardcoded profit/margin amounts and preselected demo filenames; no
  replacement financial calculation was added.
- Retry is explicitly a full fresh analysis; previous results stay visible until
  the user starts it. No silent retries or demo fallbacks were introduced.
- Four office agents follow the production request workflow. Actionable-run
  traces and local pending-request tests verify active agents and completion.
  Some initial Cornhead entry-frame snapshots preceded React's next paint;
  those snapshots alone are not claimed as sustained activity verification.
- Live result screens and local Cornhead/close-call/clear-winner/empty/502 cases
  were checked at 1440, 768 and 390 px. No horizontal overflow, clipped Decision
  content or footer overlap was observed. Office layout stayed within viewport.

The saved JSON lists exact endpoint timing, Gate data, actual Decision text,
responsive measurements and the failed readiness expectations. Full provider
response bodies and screenshots stay in `/tmp/whats-left-final-demo/` locally.

## Remaining issues before submission

1. Strict leak-category/title binding can prevent the expected Labor scenario.
2. Free-text precision gaps: candidate-attached threshold wording, a top-candidate
   reference with null Gate top_candidate_id, and raw enum text reach the UI.
3. Actionable structured facts are fixture/API driven, not transported from the
   current prose-only form. Enabling that is a separate architecture/data-entry
   task; it was not silently added here.
4. File attachments remain local selections and are explicitly not analyzed.
5. Default production Turbopack has the known sandbox worker port restriction;
   Webpack is checked separately. Existing config enables Tailwind via Turbopack,
   so responsive visual checks used the standard Turbopack dev server.

## Final automated checks

- Focused frontend, orchestration, Scenario display and demo fixtures: 58 passed.
- Full suite (Evidence, Leak, Scenario, Authorization, Calculator, Gate, Decision,
  currency and frontend coverage): 425 passed.
- ESLint: passed without warnings.
- TypeScript: passed, including Webpack build type checking.
- Webpack production build: passed.
- Default Turbopack production build: failed only at the known CSS worker local
  port-binding restriction (`Operation not permitted`), not a source regression.
- Hash audit: production API code, formulas, Gate policy/threshold, prompts,
  model assignments, shared contracts, orchestration and Agent Office unchanged.

Passing automated checks do not resolve the observed live expectation and
wording gaps listed above. Those remain explicitly recorded as failed demo
readiness checks, without rerunning, rewriting or changing validation boundaries.
