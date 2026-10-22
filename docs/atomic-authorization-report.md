# Atomic authorization extraction and deterministic assembly

The Evidence provider now returns ordinary Evidence plus `authorization_atoms`. It cannot supply final `authorization_records`: that field is absent from the strict producer schema and rejected as an extra property, including when atoms are also supplied. Code is the sole producer of the existing downstream record shape.

## Files changed

Production:
- `src/types/evidence.ts`: narrow atom union; existing returned Evidence/record/provenance shapes unchanged.
- `src/app/api/analyze/evidence/authorization-atoms.ts`: seven-way strict schema, source/numeric validation, deterministic assembler.
- `src/app/api/analyze/evidence/evidence.ts`: atomic producer schema and prompt; minimal `const`/`anyOf` support in the shared schema reader. Existing ordinary Evidence schemas are unchanged.
- `src/app/api/analyze/evidence/route.ts`: consume atoms, assemble records, invoke unchanged final-record validator, return unchanged metadata.

Tests:
- `tests/authorization-atoms.test.mjs`: 30 new tests.
- `tests/helpers/authorization-atoms.mjs`: isolated fixture-to-atom migration for mocked providers only.
- `tests/structured-authorization.test.mjs`
- `tests/evidence-authorization-diagnostic.test.mjs`
- `tests/evidence-provider-diagnostic.test.mjs`
- `tests/evidence-route.test.mjs`
- `tests/evidence-provenance.test.mjs`
- `tests/source-backed-lineage.test.mjs`
- `tests/currency-normalization.test.mjs`

## Atomic schema

All atoms have a controlled `kind`, controlled scope, and nonempty unique `source_refs` resolving only to original `source_input` sources. The provider schema enumerates this request's original source IDs. Local validation checks numeric literals and currency without interpreting prose.

| Kind | Other fields |
|---|---|
| scoped_sales | Tuesday scope, month, amount, currency |
| scoped_staffing_cost | Tuesday scope, month, amount, currency |
| headcount_reduction_permission | Tuesday scope, delta, -1, persons, explicit |
| schedule_constraint | headcount_reduction, Tuesday scope, rest_schedule_unchanged |
| current_waste_rate | ingredient_waste scope, value, percent |
| waste_target_rate | ingredient_waste scope, value, percent |
| waste_reduction_permission | ingredient_waste scope, from 9, value 5, percent, explicit |

Each union branch requires its fields and rejects additional fields. Unknown kinds, wrong scope/units/period/action, nonfinite or unanchored amounts, empty/duplicate/unknown/raw-fact/model-prose refs, and currency mismatch fail closed. Development atom diagnostics contain only a rejection category, atom index and fixed field path.

## Assembly

Invalid atoms reject the extraction. Missing or duplicate kinds do not authorize the affected candidate. No source text is parsed to classify identity, recover omitted atoms, or repair refs.

Labor requires exactly one scoped sales atom, scoped staffing-cost atom, explicit -1-person permission atom, and rest-schedule-unchanged constraint atom. Scope, period and currency must be compatible. Code maps kinds to `sales`/`staffing_cost` support roles and constructs intervention, null baseline, operation, unit and permission/constraint metadata. Permission and constraint may share the same original source ID, and their refs remain attached to both fields. The unchanged existing source-union helper deduplicates the complete downstream support set.

Waste requires current rate, target rate and a separate explicit permission atom. The supplied rates must match the permitted 9 -> 5 change. Current + target alone, target alone, or permission without current/target produces no Waste record. Delivery has no atom or assembler branch.

The existing authorization-record validator remains unchanged and runs after assembly. Existing Scenario eligibility checks, including Labor cost exceeding sales, remain downstream and unchanged. Existing Leak binding/citation rules and all calculators/Gate/Decision/frontend code remain unchanged.

## Migration and checks

Old downstream record fixtures remain valid consumer fixtures. Only mocked Evidence producers migrate through a clearly test-scoped adapter; production has no legacy model-record path. Historical scope-only source notes do not fabricate a rest-schedule-unchanged atom: their producer replays now withhold Labor while retaining explicitly permitted Waste. Existing downstream acceptance of scope-only records was not changed.

New tests cover complete Labor assembly; shared permission/constraint sources; each missing Labor component; wrong scopes/periods/currency/units/action; invalid source identities and anchors; no permission from targets; explicit Waste assembly; duplicate/ambiguous atoms; paraphrases and ordering; defense-in-depth final-record rejection; legacy producer injection rejection; and mocked Case A through all six real route handlers, ending in neutral collect_data with null savings.

Results:
- Focused: 247 passed.
- Full suite: 680 passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npx next build --webpack`: passed. Existing Next warning about the parent-directory package-lock remains.

## Remaining risk

Model semantic extraction can still omit or misclassify an atom or choose an inappropriate known source. Literal anchors and source identity do not prove semantic entailment. The assembler deterministically preserves validated extracted structure and fails closed on omissions/ambiguity; it does not guarantee stable model extraction or recover missing information. Live acceptance of the new producer schema and Case A remain unverified.

No live provider calls, retries, fallback/repair, provider/model configuration changes, or timeout changes were made.
