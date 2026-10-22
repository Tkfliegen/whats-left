# Deterministic Leak intervention binding

Implemented the scoped contract/resolver change. **16 PASS / 0 PARTIAL / 0 FAIL** on the same eight saved inputs, twice each, using `nvidia/Nemotron-3-Ultra-550b-a55b` only in the isolated evaluation. **Production remains `nvidia/Nemotron-3_5-Lightning`.** No model switch was made.

## Production files changed

1. `src/app/api/analyze/leaks/leaks.ts`: separate the model-facing semantic schema from the existing trusted/legacy reader shape; reject provider-generated bindings; remove intervention identities from generation input; align prompt/schema with code-owned bindings. Preserve complete support groups and every existing numeric/prose instruction.
2. `src/app/api/analyze/leaks/binding.ts`: new small pure binding resolver, reading only controlled categories, fact refs, validated authorization records and original-source lineage.
3. `src/app/api/analyze/leaks/route.ts`: parse semantic output, run unchanged ref/completeness/numeric validation, resolve bindings, validate the assembled trusted shape, then return the same public envelope.
4. `src/types/leaks.ts`: add a semantic-only `ModelLeakResult` type. Existing downstream `LeakResult` reader compatibility is preserved.

All other existing production source files match the pre-change hashes. In particular, `leaks/output.ts` (citation, completeness, numeric and unit validators), all Evidence/authorization assembly, Scenario/Scenario Authorization, Simulation/calculator, Gate, Decision and frontend source are unchanged. The current model, timeout and request settings are unchanged.

## Exact behavior

The model emits only evidence_refs, title, category, evidence, interpretation and confidence, plus insufficient_evidence. Its schema has **no intervention_ref property**, and additional properties are forbidden. Provider output with a malicious/stale binding, including null, is rejected; it is not stripped to rescue that response.

The prompt's printed schema, dynamic provider schema and semantic parser share the same model schema. The dynamic schema additionally limits evidence_refs to this input's fact IDs. citation_requirements retains full fact-ID support groups but exposes no intervention identities for the model to select.

The final trusted response preserves all semantic fields and refs verbatim and adds one server-owned field per finding:

```
intervention_ref: headcount_reduction | waste_rate_target | null
```

The route always supplies that field. The existing downstream reader still accepts legacy objects with the field absent; that compatibility is not a provider-generation permission. The trusted field has a consistent nullable union; it is not printed as part of the model schema.

Order:

```
provider JSON/semantic schema
  → existing reference/completeness pass for all findings
  → existing numeric/unit prose pass
  → deterministic binding
  → trusted structural validation
  → response
```

Resolver rules:

- Revalidate Evidence/provenance/authorization records using existing validation. Invalid trusted input yields no bindings.
- Use existing `requiredAuthorizationSources` eligibility and support policy. Never create an authorization or infer permission from a target.
- Apply an exhaustive typed category mapping over the existing authorization domain: headcount_reduction → labor; waste_rate_target → waste. No new intervention policy, category aliases or prose parsing.
- Resolve cited fact IDs through existing source lineage. Require every required source, including permission and constraint support, to be covered by the selected facts. Combined citable views work through their original source IDs.
- Bind only one fully supported compatible candidate, with one eligible record for that intervention identity and one matching finding. Zero, duplicate or ambiguous candidates/associations remain null; ordering never selects a winner.
- Resolver reads no title, evidence prose, interpretation or provider-selected identity. It adds no citations and changes no prose.

Missing citation support still rejects under the existing intersection/completeness rules before binding. A valid finding that has no eligible supported intervention survives unbound. Omitting the entire authorization group does not create an intervention or permission; the ordinary semantic/ref/numeric requirements still apply. Existing trusted-binding completeness checks remain available for legacy/trusted readers; no completeness or numeric function was weakened.

Model-selected intervention identity is fully removed from the trusted generation path. Category remains a model semantic classification; category alone can never establish a binding without a validated authorized record and complete source support.

## Offline tests and checks

- **121 focused Leak/wording tests passed.**
- **735 full-suite tests passed.**
- ESLint: passed.
- TypeScript (`tsc --noEmit`): passed.
- Production build (`next build --webpack`, previously working path): passed.

Fourteen new tests cover Case A Labor/Waste/Delivery; global intervention borrowing; missing support with structural-before-numeric ordering; unique matches; duplicate records and duplicate finding associations; invalid authorization/source data; combined lineage; prose-independent identity; explicit Waste permission versus target; schema/prompt consistency; strict rejection of stale/malicious model bindings; explicit null without an authorization; unchanged numeric/unit rejection; provider-output immutability; and evaluation capture of raw versus resolved state.

Existing route fixtures were migrated to the semantic-only provider contract and now assert the explicit server-owned bindings in responses. Direct trusted/legacy validator tests retain coverage of bound-group completeness. Historical prompt snapshot assertions were updated to the new intentional contract; historical evaluation inputs/results were not rewritten. The mocked downstream integration test still verifies Labor-only authorization, Waste/Delivery not_simulation_ready, Labor not_calculable_yet, Gate needs_more_data and Decision collect_data without production downstream changes.

Evaluation-only additions are `scripts/evaluation/leak-ab/deterministic-binding.mjs`, `tests/leak-deterministic-binding.test.mjs`, `tests/leak-binding-evaluation.test.mjs` and this report directory. The shared isolated observation helper now records the real handler's trusted output separately from raw semantic output and uses the actual semantic parser for schema validity. No production behavior is implemented in evaluation code.

## 16-call Ultra regression

Input bytes exactly match `docs/evaluations/leak-lightning-ultra/cases.json`; two observations per note, unchanged expected categories/scoring. The updated production handler and validators are exercised in isolation with only the transport model override. Two concurrent workers; same 60,000 ms timeout, temperature 0.2, max_tokens 4000, thinking disabled. No Evidence extraction or downstream provider/endpoints were called.

All 16 provider HTTP responses and handler Response statuses were 200. Every raw semantic result passed schema/ref shape and existing citation/numeric validation. Every trusted response differed from its raw result only by server-added intervention_ref fields (asserted for every run). Manual source-grounded review found no false-positive qualitative findings or derived numeric claims.

| Metric | Result |
| --- | ---: |
| PASS / PARTIAL / FAIL | 16 / 0 / 0 |
| Citation failures | 0 |
| Numeric/unit failures | 0 |
| Incorrect/cross-category bindings | 0 |
| Uncited source numbers | 0 |
| Forbidden derived-number violations | 0 |
| Fact/source IDs in prose | 0 |
| False-positive qualitative findings | 0 |
| Malformed/schema failures | 0 |
| Provider errors / timeouts | 0 / 0 |
| Mean provider latency | 1.920s |
| Maximum provider latency | 4.440s |

### Every observation

Raw semantic validity below includes the existing citation/numeric pass. The detailed results retain raw findings, trusted findings, fact refs, all prose numeric tokens, actual diagnostics and both latency measurements separately.

| Case | Repeat | Raw semantic valid | Resolved bindings | Result | Provider latency |
| --- | ---: | --- | --- | --- | ---: |
| case_a | 1 | Yes | labor: headcount_reduction, waste: null, delivery: null | PASS | 4.440s |
| case_a | 2 | Yes | labor: headcount_reduction, waste: null, delivery: null | PASS | 4.330s |
| staffing_wording | 1 | Yes | labor: null | PASS | 1.829s |
| staffing_wording | 2 | Yes | labor: null | PASS | 1.820s |
| percentage_gap | 1 | Yes | waste: null | PASS | 1.610s |
| percentage_gap | 2 | Yes | waste: null | PASS | 1.634s |
| separate_fact_numbers | 1 | Yes | delivery: null | PASS | 1.702s |
| separate_fact_numbers | 2 | Yes | delivery: null | PASS | 1.465s |
| time_scope | 1 | Yes | labor: null | PASS | 1.828s |
| time_scope | 2 | Yes | labor: null | PASS | 1.733s |
| qualitative_only | 1 | Yes | delivery: null | PASS | 1.561s |
| qualitative_only | 2 | Yes | delivery: null | PASS | 1.453s |
| irrelevant_numbers | 1 | Yes | waste: null | PASS | 1.681s |
| irrelevant_numbers | 2 | Yes | waste: null | PASS | 1.577s |
| ambiguous | 1 | Yes | No findings | PASS | 1.047s |
| ambiguous | 2 | Yes | No findings | PASS | 1.013s |

### Specific acceptance

Both Case A runs passed:

- Labor → headcount_reduction, with complete source-backed refs _12/_13/_14/_15/_16.
- Waste → null, with _17/_18/_19; target does not create permission.
- Delivery → null; no approved intervention.
- Staffing 4 is cited, not borrowed from descriptive context.
- No derived 4 percentage points, IDs in prose, fabricated savings or false-positive leak conclusions.
- Tuesday cost remains Tuesday-scoped; Friday comparison does not inherit it.

The ambiguous note returns no findings in both runs. The other cases preserve the expected source-backed qualitative leaks without manufacturing authorized interventions. Category sets are consistent across all eight repeat pairs.

This meets the requested 15–16 PASS target. No remaining failure mode was observed in this controlled sample, and no additional fix was added. Sixteen calls on eight notes are not a guarantee of production-wide reliability. The 60-second timeout affected none of these calls and shows no observed timeout regression.

See [results.json](results.json), [summary.json](summary.json), [manifest.json](manifest.json) and [source-check.json](source-check.json). All production source hashes stayed stable during the live evaluation; the changed-file allowlist contains exactly the four files listed above. No raw provider envelopes, keys or headers are saved.

Exactly **16 planned Ultra Leak calls**, no automatic retry, repair, fallback, live Scenario/Decision calls or model switch. Full production-path sign-off was not part of this isolated regression; downstream coverage here is offline mocked integration only.

**Recommendation: switch Leak to Ultra.** The switch has not been implemented.
