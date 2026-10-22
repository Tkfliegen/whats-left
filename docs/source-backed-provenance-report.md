# Source-backed provenance and final Cornhead sign-off

**FINAL DEMO SIGN-OFF: PASS**

The single fresh live Cornhead run completed in **16.231 seconds** through the normal app. All six endpoints returned 200. Labor and Waste were authorized through fact-to-source lineage; Delivery remained unready. No retries, fallback responses, provenance repair, or changes after the run were used.

1. **Files changed:** complete list below. Existing provenance work and pre-existing workspace changes were preserved.
2. **Final fact design:** `Evidence.provenance` retains `source_input` and `items`, and adds `citable_facts: [{id, text, source_refs}]`. Original statement IDs use `src_<source digest>_<ordinal>`; citable fact IDs use `fact_<source digest>_<ordinal>`. Every original statement has a citable fact. A line spanning several statements also has a fact containing the whole line and all its source refs, recorded by position during segmentation. Duplicate source statements keep distinct positional identities; ambiguous authorization facts still refuse authorization.
3. **Fact ID generation:** `createEvidenceProvenance` generates IDs in code after Evidence model schema validation and existing currency normalization. A 128-bit SHA-256 digest of normalized original source lines namespaces source and fact IDs. Their identity/order does not depend on model prose, model fact ordering, or model-extracted financial fields.
4. **Source-ref generation:** the same function creates original statement IDs and the fact-to-source edges directly from segmentation positions. No matching of model prose, model-selected attribution, aliases, or semantic inference is involved. Multi-source facts retain every ref.
5. **Model prose separation:** `Evidence.facts` and extracted item descriptions remain available as descriptive context. Their existing provenance item IDs cannot be cited by Leak and never acquire inferred lineage. The model output schema still excludes the provenance manifest; attempts to inject it reject.
6. **Leak input/output:** `buildLeakInput` supplies descriptive Evidence/context and a citable `{id,text}` table. Source IDs, source_refs, and model-prose IDs stay out of the model's input table. Leak outputs fact IDs only; it never needs to reproduce source attribution.
7. **Leak ref validation:** the provider schema enumerates only supplied citable fact IDs. Local validation requires nonempty unique fact refs, exact membership, and a fully valid regenerated manifest. Raw-source refs, model-prose refs, missing/unknown/forged refs, and model-added source mappings reject. Provider output is neither repaired nor retried.
8. **Authorization resolution:** `resolveEvidenceRefs` resolves each cited fact through the validated code-generated manifest and unions all original source refs. Authorization compares this resolved set against the existing required problem/permission source IDs. It does not inspect Leak prose, title, or category for identity. Scenario output must retain the required source IDs, as before.
9. **Fail closed:** missing/empty/forged lineage, unknown source IDs, duplicate fact IDs, tampered manifests, partial required source sets, unrelated refs, and unresolved ambiguity all reject or refuse authorization. Existing strict original-source capability/permission rules remain. No text fallback, semantic fallback, or automatic repair exists.
10. **Focused tests:** 332/332 passed across source-backed lineage, Evidence provenance/route, Leak, Scenario authorization/route, recorded integration/currency, and Decision tests. New coverage includes model-prose independence, fact-only model input, unknown and ineligible IDs, forged/missing/duplicate lineage, partial and unrelated source sets, multi-source union, title/category variants, Delivery, and model-injected mappings.
11. **Full suite:** 515/515 passed.
12. **Lint:** passed without warnings.
13. **TypeScript:** `npx tsc --noEmit` passed after the build.
14. **Webpack build:** `npx next build --webpack` passed. The existing outside-repository lockfile warning remains. No Turbopack production rerun was needed.
15. **Recorded failure replay:** passed through all six local production routes with mocked provider responses. The saved model Evidence and exact Leak explanatory prose were retained, including original target `The business's stated internal target is 5%.` versus explanation `The business's stated internal target is 5% waste rate.` The replay explicitly selects code-generated facts for the recorded original source positions under the approved new contract. Labor and Waste authorize; Delivery stays unready. Old model-prose IDs intentionally reject rather than silently receiving lineage.
16. **Fresh live Cornhead:** one browser submission, six real endpoint responses, zero fixture responses, total 16.231 s including frontend handoffs. Live lineage was also audited offline against the unchanged production validators. Desktop/tablet/mobile rendering checks passed with no runtime exceptions.
17. **Labor:** authorized as Tuesday evening headcount delta **-1 person**, unknown baseline retained as null. Simulation: `not_calculable_yet`, calculation null; authoritative baseline headcount and labor cost per worker remain missing.
18. **Waste:** authorized as **9% → 5%** with current, target, and existing explicit test-permission source refs. Simulation: `not_calculable_yet`, calculation null; authoritative ingredient purchases remain missing.
19. **Delivery:** remained `not_simulation_ready`; no controllable decision input or intervention was invented.
20. **Decision:** Gate `needs_more_data`, comparison gap `not_applicable`, top candidate null. Real Decision `needs_more_data / collect_data`, candidate ID null. Rationale: “More data is needed because no calculable scenarios exist.” Candidate-neutral, with no misleading threshold wording, fake savings, or invented intervention. All verified impact values remain null. Frontend first reached Complete **31 ms after real Decision succeeded**; no early Complete occurred.
21. **Remaining blockers:** none for the requested demo sign-off. The missing authoritative calculation inputs are expected data requirements; no savings estimate was fabricated to bypass them.

Models, timeouts, calculator formulas, Gate logic, Decision Agent, threshold policy, currency normalization, and frontend decision logic were unchanged in this task. Production edits were limited to the shared provenance type, Evidence provenance generation/validation/resolution, Leak input/schema/validation, and Scenario authorization's ID resolution. The model cannot invent trusted lineage: code regenerates and verifies the entire lineage manifest, and Leak may select only supplied fact IDs.

## Live endpoint results

| Endpoint | HTTP | Elapsed |
|---|---:|---:|
| `/api/analyze/evidence` | 200 | 4.366 s |
| `/api/analyze/leaks` | 200 | 3.926 s |
| `/api/analyze/scenarios` | 200 | 2.005 s |
| `/api/analyze/simulate` | 200 | 0.044 s |
| `/api/analyze/decision-gate` | 200 | 0.051 s |
| `/api/analyze/decision` | 200 | 2.346 s |

Evidence currency was canonical **USD**.

## Changed files

- [src/types/evidence.ts](/Users/ting/Documents/whats-left/src/types/evidence.ts)
- [src/app/api/analyze/evidence/provenance.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/evidence/provenance.ts)
- [src/app/api/analyze/scenarios/authorization.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/scenarios/authorization.ts)
- [src/app/api/analyze/leaks/leaks.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/leaks/leaks.ts)
- [src/app/api/analyze/leaks/route.ts](/Users/ting/Documents/whats-left/src/app/api/analyze/leaks/route.ts)
- [tests/source-backed-lineage.test.mjs](/Users/ting/Documents/whats-left/tests/source-backed-lineage.test.mjs)
- [tests/currency-normalization.test.mjs](/Users/ting/Documents/whats-left/tests/currency-normalization.test.mjs)
- [tests/evidence-provenance.test.mjs](/Users/ting/Documents/whats-left/tests/evidence-provenance.test.mjs)
- [tests/leaks-route.test.mjs](/Users/ting/Documents/whats-left/tests/leaks-route.test.mjs)
- [tests/fixtures/scenarios-bagel.json](/Users/ting/Documents/whats-left/tests/fixtures/scenarios-bagel.json)
- [tests/fixtures/complete-clear-winner.json](/Users/ting/Documents/whats-left/tests/fixtures/complete-clear-winner.json)
- [tests/fixtures/complete-close-call.json](/Users/ting/Documents/whats-left/tests/fixtures/complete-close-call.json)
- [tests/fixtures/provenance-recorded-cornhead.json](/Users/ting/Documents/whats-left/tests/fixtures/provenance-recorded-cornhead.json)
- [tests/fixtures/decision.json](/Users/ting/Documents/whats-left/tests/fixtures/decision.json)
- [docs/source-backed-provenance-report.md](/Users/ting/Documents/whats-left/docs/source-backed-provenance-report.md)

## Verification artifacts

- [Raw live browser report](/tmp/whats-left-source-backed-signoff/cornhead.json)
- [Live fact-to-source lineage audit](/tmp/whats-left-source-backed-signoff/lineage-audit.json)
- [Rendered page text](/tmp/whats-left-source-backed-signoff/cornhead.txt)
- [Desktop Decision screenshot](/tmp/whats-left-source-backed-signoff/cornhead-desktop.png)
- [Mobile Decision screenshot](/tmp/whats-left-source-backed-signoff/cornhead-mobile.png)
- [Focused test log](/tmp/source-backed-focused.log)
- [Full-suite test log](/tmp/source-backed-full.log)

Source hashes matched the pre-live snapshot after verification. No post-run production changes or second submission occurred.
