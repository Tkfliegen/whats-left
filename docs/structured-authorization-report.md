# Structured source-bound Scenario authorization

Implemented the approved minimal Evidence producer/wiring and deterministic authorization builder. No live provider calls were made.

1. **Files changed:** complete list below. Existing uncommitted work was preserved.
2. **Flow:** the Evidence route generates an original-source catalog using the existing provenance generator. Its source IDs are independent of model-extracted prose. The provider's Evidence schema requires `authorization_records`; the model classifies semantic roles, scope, permission and constraints using only catalog IDs. Code validates the records, normalizes currency using the existing function, and stores validated records under optional `evidence.provenance.authorization_records`. The existing source items, citable facts, IDs and fact-to-source edges are unchanged. This metadata location keeps the records out of Leak's model input and the frontend numeric context without changing either consumer. Scenario authorization resolves Leak fact IDs to original source IDs, verifies the complete candidate source set and matching input_facts, and constructs the existing authorization objects itself. No sentence-template, fuzzy, semantic-similarity or prose fallback exists.
3. **Exact Labor requirements:** one unambiguous headcount_reduction record; Tuesday evening 6 PM–10 PM scope; delta operation; null absolute baseline; value -1; persons unit; explicit permission with nonempty original-source refs containing the literal change magnitude 1; an affected-scope-only or rest-schedule-unchanged constraint with source refs; sales and staffing_cost roles for the monthly affected period and the canonical Evidence currency; each copied numeric value anchored in its cited original sources; staffing cost greater than sales; every required support, permission and constraint ID present in the resolved Leak refs and unchanged input_facts; exactly one matching finding. Extra variables remain forbidden by existing Scenario support validation. The current note's rest-schedule constraint is retained in its structured record, cited through available_input_refs, and the only allowed controlled variable remains Tuesday evening headcount.
4. **Exact Waste requirements:** one unambiguous waste_rate_target record; ingredient_waste scope; absolute_target operation; from 9; target 5; percent unit; explicit permission with source refs supporting both literal values; current_waste_rate and target_waste_rate roles with matching values, monthly period, percent unit and null currency; original-source numeric anchoring and full Leak/source/input_facts binding. A target-only record has permission absent and cannot authorize. Purchases data is not permission. No Delivery record or intervention type is accepted. Constraints outside the two existing policies are not inferred or repaired.
5. **Tests:** cases A–G are covered in tests/structured-authorization.test.mjs. Current recorded note grants Labor only. Explicit separate Waste permission grants both. Paraphrased Labor source text succeeds with appropriately extracted records and fresh IDs. Missing/denied permission, missing supporting roles, omitted Leak refs, unknown/unrelated source refs, invented values, incompatible operation/amount/baseline/unit/scope/currency/period, missing constraints, duplicate roles, duplicate interventions, cross-domain ambiguity, model-added authorization IDs and missing extraction fields fail closed. Offline production-route integration exercises the actual Evidence producer/schema/catalog, unchanged Leak and Scenario routes, and real calculator. It asserts existing provenance identity is unchanged and no invented savings are produced. Prior currency, Decision, numeric-guard and calculable-fixture checks remain in the full suite. Fixtures now explicitly supply structured extraction records; production has no fixture imports or record-generation fallback.
6. **Verification:** 32 new structured-authorization tests; 347 focused tests passed; full suite 563/563 passed. Lint passed without warnings. TypeScript passed. Webpack production build passed; only the pre-existing outside-repository lockfile warning remained. No Turbopack production rerun or live provider submission occurred.
7. **Behavior outside authorization:** no changes to Leak behavior, Scenario Agent/prompt/output contract, Decision/Gate, frontend, numeric guard, formulas, models/settings, currency normalization, retries/fallback/repair, or What's Left/Margin. Their source hashes were checked. The necessary Evidence extraction contract now requires the additional record array and rejects invalid record source/policy support with 502. Legacy Evidence metadata remains readable but cannot authorize without structured records; no legacy prose fallback remains.
8. **Remaining architectural risk:** semantic role, scope, permission and constraint classification is performed by the Evidence model, as authorized. Code checks typed policy bounds, original-ID membership, literal numeric anchors, complete reference sets and downstream controlled changes; IDs alone cannot prove natural-language entailment. An incorrect semantic classification of otherwise valid source text is still possible. The manifest is consistency/provenance validation, not cryptographic client authentication. Offline mocks verify production wiring and deterministic rejection behavior, not live extraction accuracy or model reliability. A live run was not requested for this implementation task and was not performed.

## Required matrix

| Case | Labor | Waste | Delivery |
|---|---|---|---|
| A: current note | Authorized, -1 person | Unready: no explicit permission | Unready |
| B: plus explicit Waste permission | Authorized | Authorized, 9% → 5% | Unready |
| C: Labor source wording paraphrased, same structured support | Authorized | Unready | Unready |
| D: no Labor permission | Unready | Unready | Unready |
| E: incomplete/mismatched Labor support | Unready | Unready | Unready |
| F: Waste target without permission | Authorized | Unready | Unready |
| G: Waste grant but incomplete Waste support | Authorized | Unready | Unready |

Simulation remains governed by the existing structured calculation-input contract. Natural-language headcount, per-worker cost or purchases figures are not silently converted into calculator inputs. Existing complete structured-calculation fixtures still pass; the current-note integration returns null impacts rather than fabricated savings.

## Changed files

- [src/types/evidence.ts](/Users/ting/Documents/whats-left/src/types/evidence.ts)
- [src/app/api/analyze/evidence/evidence.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/evidence/evidence.ts)
- [src/app/api/analyze/evidence/provenance.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/evidence/provenance.ts)
- [src/app/api/analyze/evidence/authorization-records.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/evidence/authorization-records.ts)
- [src/app/api/analyze/evidence/route.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/evidence/route.ts)
- [src/app/api/analyze/scenarios/authorization.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/scenarios/authorization.ts)
- [tests/source-backed-lineage.test.mjs](/Users/ting/Documents/whats-left/tests/source-backed-lineage.test.mjs)
- [tests/structured-authorization.test.mjs](/Users/ting/Documents/whats-left/tests/structured-authorization.test.mjs)
- [tests/currency-normalization.test.mjs](/Users/ting/Documents/whats-left/tests/currency-normalization.test.mjs)
- [tests/evidence-provenance.test.mjs](/Users/ting/Documents/whats-left/tests/evidence-provenance.test.mjs)
- [tests/evidence-route.test.mjs](/Users/ting/Documents/whats-left/tests/evidence-route.test.mjs)
- [tests/fixtures/scenarios-bagel.json](/Users/ting/Documents/whats-left/tests/fixtures/scenarios-bagel.json)
- [tests/fixtures/complete-clear-winner.json](/Users/ting/Documents/whats-left/tests/fixtures/complete-clear-winner.json)
- [tests/fixtures/complete-close-call.json](/Users/ting/Documents/whats-left/tests/fixtures/complete-close-call.json)
- [tests/fixtures/authorization-current-note.json](/Users/ting/Documents/whats-left/tests/fixtures/authorization-current-note.json)
- [tests/helpers/provenance.mjs](/Users/ting/Documents/whats-left/tests/helpers/provenance.mjs)
- [docs/structured-authorization-report.md](/Users/ting/Documents/whats-left/docs/structured-authorization-report.md)

## Test logs

- [Focused](/tmp/structured-auth-focused.log)
- [Full suite](/tmp/structured-auth-full.log)
