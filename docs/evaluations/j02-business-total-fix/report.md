# J02: Evidence business-total grounding

## Scope and ownership

Added extraction-only `business_total_support` for `revenue.total` and `costs.total` only. The downstream Evidence/provenance schema has no new fields. No generalized typed-fact architecture or authorization changes.

Record shape:

```ts
{
  field: "revenue.total" | "costs.total",
  value: number,
  scope: "whole_business",
  period: string,
  currency: string,
  source_refs: string[]
}
```

Provider schema requires the support array and enumerates existing source IDs. The minimal prompt addition instructs extraction of explicitly reported whole-business revenue/sales or total operating costs/expenses; excludes days, shifts, channels, categories, staffing, ingredients, rent, utilities, delivery fees, subtotals, partial-period/ambiguous amounts and computed sums. It forbids inferring exhaustiveness or summing, requires exact Evidence period and canonical currency, and specifies an empty array when absent. Existing authorization instructions remain unchanged.

## Deterministic rules and limitations

For each non-null total, require exactly one matching support record with:

- valid field and whole-business scope, strict record shape and finite numeric value;
- nonempty unique original source IDs, excluding model-descriptive provenance entries;
- a literal numeric anchor in cited original source text;
- currency equal to non-null canonical Evidence currency;
- period exactly equal to nonblank Evidence reporting period;
- value equal to the model-produced corresponding total.

Duplicate/conflicting support is ambiguous and nulls that total. Wrong field, scope, source, numeric anchor, period, currency or value cannot validate it. No role/period prose matching, aliases, arithmetic or component aggregation occurs. AI still classifies whether the original source describes a whole-business total; deterministic checks validate the declared structural relationships and anchors, not complete natural-language entailment. Fabricated semantic classification is not made impossible by this metadata alone.

Absent/malformed/invalid support nulls only the unsupported total and preserves otherwise valid granular Evidence. Support is required in the provider schema but locally treated as extraction-only metadata: missing/malformed support cannot reject otherwise valid items and cannot preserve an unsupported non-null total. All previous base-schema/authorization rejection paths remain. No matching support record is manufactured. This null projection is the explicitly requested behavior, not a provider retry or citation repair.

Grounding occurs after currency/authorization validation and before trusted provenance construction. Revenue/cost item arrays, facts and authorization records are retained. Original source/citable IDs remain stable; descriptive Evidence IDs naturally reflect the resulting trusted totals. Metadata is stripped from the client result. A development-only structured grounding diagnostic records counts, total decisions and safe support projections; it excludes source/provider prose and redacts invalid IDs/enum values. Period/currency comparisons are logged as booleans rather than arbitrary strings. Production logging is silent.

## Files changed

Production:
- `src/app/api/analyze/evidence/business-totals.ts` (new): support schema, validation, null projection, structured diagnostics.
- `src/app/api/analyze/evidence/evidence.ts`: extraction schema and narrow total-support prompt instructions.
- `src/app/api/analyze/evidence/route.ts`: strip metadata, validate/ground totals before provenance, development diagnostics.
- `src/types/evidence.ts`: extraction-only support type; downstream Evidence shape unchanged.

Tests:
- `tests/business-totals.test.mjs` (new).
- `tests/evidence-route.test.mjs`, `tests/evidence-provider-diagnostic.test.mjs`, `tests/evidence-provenance.test.mjs`, `tests/currency-normalization.test.mjs`: mock fixtures/expected provenance reflect unsupported totals becoming null; currency/provider tests remain focused on their original boundaries.
- `tests/authorization-atoms.test.mjs`, `tests/evidence-ab-evaluation.test.mjs`, `tests/evidence-lightning-evaluation.test.mjs`: include empty extraction-only support in schema-valid mock outputs, preserving original authorization/scoring assertions.

Evaluation-only compatibility: `scripts/evaluation/evidence-ab/evaluate.mjs` strips/grounds extraction metadata before downstream evaluation, matching the production route. No A/B experiment was run. Existing judge browser harness reused unchanged.

## Tests

New coverage includes explicit revenue/cost totals alongside items; J02 revenue components and staffing subtotal; component sums without literal total anchors; wrong field/scope/source, empty/duplicate refs, currency/period/value mismatch; ambiguous duplicates; unknown currency/period; exclusion of descriptive source IDs; provider schema; route support stripping; malformed support preserving items; unchanged authorization records/source lineage; and unchanged J05 currency normalization.

- Focused total/currency/Evidence/authorization/provenance tests: **168/168 pass**.
- Full suite: **788/788 pass**.
- ESLint: pass.
- TypeScript `tsc --noEmit`: pass (final sequential check after build).
- Production build `next build --webpack`: pass.

## One live J02 submission

Exact saved J02 payload, current models/providers, normal browser app pipeline. No retry, repair, fallback, alternate model or full twelve-case run.

| Field | Before (previous J02) | Current provider scalar | Trusted output |
|---|---:|---:|---:|
| revenue.total | 10000 | null | null |
| costs.total | 3300 | null | null |

Extracted support records: **[]**. Development diagnostic reports zero emitted records, zero matching/validated support for both fields, original totals null and trusted totals null (`missing_support`). The model itself emitted null this run. The code-side nulling of unsupported non-null values is verified offline; do not describe this live result as code rewriting a non-null provider total.

Granular items remain: Tuesday sales USD2100, Friday sales USD7900, Tuesday staff pay USD3300, with original source excerpts. Labels can vary between model runs; no deterministic item rewrite was introduced. Evidence currency USD; reporting period `last month`; authorization records empty, correctly reflecting no approved staffing experiment. Source/citable IDs unchanged.

| Stage | HTTP | Browser round-trip latency |
| evidence | 200 | 2.383s |
| leaks | 200 | 2.059s |
| scenarios | 200 | 0.737s |
| simulate | 200 | 0.055s |
| decision-gate | 200 | 0.054s |
| decision | 200 | 1.468s |

Leak Labor finding is valid and unbound. Scenario correctly abstains with code-owned eligibility wording, simulation returns an empty result set, Gate is `no_actionable_scenario`, Decision is bounded `collect_data` with no selected candidate. Frontend reaches **Complete** only after genuine Decision success. End-to-end latency **10.250s**. No first failing stage, new validation rejection or accepted numeric/unit/scope escape was observed. No fabricated savings.

## Scope verification

Compared with the immediately preceding J05-fix manifest, only the four listed production files differ (three modified, one new). J05 currency parser, item extraction logic, authorization atoms/permission semantics and validators, Leak, Scenario, intervention binding, calculator, Gate, Decision, frontend, model selection, provider configuration and timeouts are unchanged. Production source remained unchanged during the live run. Exact saved payload and model IDs verified; one app submission only. No retries/repairs/fallbacks introduced. This is one smoke run, not a general reliability estimate.
