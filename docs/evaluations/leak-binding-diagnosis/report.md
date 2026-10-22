# Diagnosis: Case A Waste bound to Labor

**Recommendation: C — deterministic intervention binding at the Leak boundary.** Keep AI responsible for findings and fact selection; derive the intervention association only from an existing eligible authorization record, controlled category compatibility, and complete cited source-ID coverage. Do not implement this recommendation yet.

The confirmed architectural defect is that a globally available intervention enum is selectable for every finding independently of category and evidence. The contract also contains two inconsistent schema descriptions. These explain a structural opportunity for the wrong association; the artifacts cannot prove the model's internal reason for choosing it. The prompt explicitly prohibits the observed association and null is available, so describing this as a forced non-null choice would be incorrect.

## Exact request reconstruction

[provider-request.json](provider-request.json) contains the exact model-visible system prompt, user input, dynamic schema and settings, with no API key/headers. Its serialized request SHA-256 matches **both** saved hardened Case A requests. [model-visible-input.json](model-visible-input.json) is the exact parsed user-message object, and [rejected-completions.json](rejected-completions.json) contains both full structured results and locally reproduced diagnostics. This is deterministic reconstruction from saved artifacts/current unchanged source, not a new provider request.

The model sees exactly four user-message keys:

- `evidence`: descriptive Evidence, excluding its entire provenance object. Café, month, USD; revenue 100000; costs 95800; scoped revenue items; cost items with descriptive `reported_category` strings; eleven descriptive facts; no assumptions; ten missing-information topics; high confidence.
- `operational_context`: twenty original business-note statements. These repeat the source observations, permission and constraint as natural-language strings, with no per-statement typed role or authorization metadata.
- `citable_facts`: 24 `{id,text}` entries. No fact-level category, role, permission flag, constraint flag, or source_refs is exposed.
- `citation_requirements`: one global intervention/support group, reproduced below. It has no `category`, scope, operation, value, unit, permission or constraint fields.

There are **no input Leak findings**, and no raw `authorization_records` or authorization atoms visible to the model. The full server-side Labor record exists but is removed with provenance before generation. Its effect on model input is the citation group and permitted intervention enum, plus the original permission/constraint prose.

All fact IDs below use prefix `fact_abbca75924f4c231a119ad1248d351f3_`. Suffixes are shorthand only; the exact full IDs and text are in the linked input.

| Suffix | Exact citable text |
| --- | --- |
| 01 | Business name: Cornhead Bagel |
| 02 | Selected business type: Café |
| 03 | Business description / notes: Business performance for last month. |
| 04 | Currency: USD. |
| 05 | Total revenue was $100,000. |
| 06 | Total operating costs were $95,800, including: |
| 07 | Labor: $34,000 |
| 08 | Ingredients: $18,000 |
| 09 | Rent and utilities: $12,500 |
| 10 | Delivery platform fees: $9,300 |
| 11 | Other operating costs: $22,000 |
| 12 | Tuesday evenings from 6 PM to 10 PM generated $1,900 in sales for the month. |
| 13 | During that Tuesday evening period, we normally scheduled 4 staff members. |
| 14 | The total staffing cost for those Tuesday evening shifts was $2,500 for the month, equal to $625 per staff member for that affected monthly period. |
| 15 | Friday evenings used the same staffing level of 4 people, but generated $6,200 in monthly sales. |
| 16 | The owner is willing to test reducing Tuesday evening staffing by 1 person while keeping the rest of the schedule unchanged. |
| 17 | Ingredient waste is currently measured at 9%. |
| 18 | The business's stated internal waste target is 5%. |
| 19 | Ingredient purchases for the waste-tracked category were $12,500 during the same month. |
| 20 | For delivery orders, average revenue per order was $18.40. |
| 21 | Some delivery orders had combined platform fees, packaging, discounts, and food costs that exceeded the revenue from the order. |
| 22 | The business has not yet identified or approved a specific controllable change for delivery pricing, fees, packaging, discounts, minimum order size, or menu pricing. |
| 23 | Business description / notes: Business performance for last month. Currency: USD. |
| 24 | During that Tuesday evening period, we normally scheduled 4 staff members. The total staffing cost for those Tuesday evening shifts was $2,500 for the month, equal to $625 per staff member for that affected monthly period. |

The only structured intervention group visible to the model is:

```json
[
  {
    "intervention": "headcount_reduction",
    "fact_ids": [
      "fact_abbca75924f4c231a119ad1248d351f3_12",
      "fact_abbca75924f4c231a119ad1248d351f3_14",
      "fact_abbca75924f4c231a119ad1248d351f3_16"
    ]
  }
]
```

Server-side only, the validated record establishes `headcount_reduction`, `tuesday_evening_6pm_10pm`, operation delta, value -1 persons, explicit permission, and `rest_schedule_unchanged`. Permission and constraint both use source `_16`; sales uses `_12`, staffing cost `_14`. Waste has no explicit test permission and no record; Delivery has no approved controllable intervention and no record. No typed version of this record is included in the model's user message.

The category vocabulary is global: labor, ingredients, delivery, waste, operations, pricing, other. The input cost item categories are descriptive labels, not a category/intervention compatibility map.

## Findings and correct associations

Both completions order the findings identically. All full IDs use the prefix above.

| Index/category | Returned evidence refs | Correct binding | Visible candidate choices |
| --- | --- | --- | --- |
| 0 / labor | _12, _13, _14, _15, _16 | headcount_reduction | global headcount_reduction or null |
| 1 / waste | _17, _18, _19 | null; no Waste permission/grant | same global choices |
| 2 / delivery | _20, _21, _22 | null; no approved intervention | same global choices |

References belong to the finding, not individual evidence strings. Waste still qualifies as an observed leak; an unbound finding is not an authorization grant. Target 5% does not imply permission.

## Exact rejected portions

The following Waste object is identical in **both repeat 1 and repeat 2**:

```json
{
  "evidence_refs": [
    "fact_abbca75924f4c231a119ad1248d351f3_17",
    "fact_abbca75924f4c231a119ad1248d351f3_18",
    "fact_abbca75924f4c231a119ad1248d351f3_19"
  ],
  "intervention_ref": "headcount_reduction",
  "title": "Ingredient waste above internal target",
  "category": "waste",
  "evidence": [
    "Ingredient waste is currently measured at 9%.",
    "The business's stated internal waste target is 5%.",
    "Ingredient purchases for the waste-tracked category were $12,500 during the same month."
  ],
  "interpretation": "Actual waste is 9%, above the stated 5% target. Ingredient purchases for the waste-tracked category were $12,500 during the same month.",
  "confidence": "high"
}
```

Both Labor objects use `category: labor`, `intervention_ref: headcount_reduction`, and cite _12 through _16. Both Delivery objects use `category: delivery`, `intervention_ref: null`, and cite _20 through _22. Complete objects, including differing Labor/Delivery wording and insufficient-evidence entries, are preserved separately for each repeat in rejected-completions.json. The original outputs were not edited for this diagnosis.

## Why the wrong binding is available

**D is the primary structural gap, with B and C contributing; E is an additional concrete schema inconsistency.** A more explicit natural-language rule has already failed twice.

- **A — prompt ambiguity:** the added prose clearly restricts Labor to labor and says return null otherwise. Lack of that instruction is not the problem. However, a contradictory schema is appended after the prose, so the overall generation contract is inconsistent.
- **B — representation:** `headcount_reduction` is a global candidate, not an intervention restricted to a labor finding. Its support group lists IDs without typed category/permission/constraint metadata. Waste facts themselves do not support Labor; the wrong association comes from borrowing a globally visible candidate, not from an incorrect Evidence grant.
- **C — schema:** the dynamic provider schema requires every finding to contain intervention_ref. It permits `headcount_reduction` or null for *all* categories; no conditional branch makes Waste/Delivery null-only. This requires a decision on every finding, but does **not** force a non-null value: Delivery returns null in both outputs.
- **D — structural compatibility:** category and intervention_ref are independent properties. There is no schema relationship or validator category check preventing a Waste/headcount pair when the enum value is globally eligible.
- **E — two schema descriptions disagree:** the system prompt ends with the base schema, whose field is `{type:["string","null"], enum:["headcount_reduction","waste_rate_target"]}` and is optional. Under JSON Schema enum semantics, null is not in that enum. The provider schema instead requires the field and uses enum `["headcount_reduction",null]`. The only shared non-null value is headcount_reduction. This makes it a plausible attractive default where the model is choosing an identity, but is not proof of causation. Null is still accepted by the real provider and used elsewhere.

Additionally, the local `matchesSchema` helper accepts null as soon as the type includes null and does not check enum for null. Thus local validation accepts null despite the base schema's enum discrepancy; local success does not mean the schema text presented to the model is internally consistent. [schema-trace.json](schema-trace.json) records these facts. No matcher/schema was changed.

Case A is uniquely exposed in this eight-case set: it is the only case with a nonempty eligible intervention group mixed with findings from other categories. In the seven synthetic cases, the dynamic enum is `[null]`, leaving no non-null intervention to borrow. Consequently their success does not establish reliable cross-category binding behavior.

## Why the validator reports missing citations

The existing `validateLeakReferences` does the following in finding order:

1. Resolve returned fact IDs to trusted source IDs.
2. Reject a non-null binding only if it does not identify exactly one eligible global group.
3. Mark a group applicable if the binding equals its intervention **or** cited sources intersect that group.
4. For an applicable group, require complete source coverage; return incomplete_citation_support against the finding's evidence_refs on failure.

For Waste, returned facts _17/_18/_19 are valid IDs. `headcount_reduction` identifies exactly one eligible group, so it is not invalid_intervention_ref. The explicit binding makes the Labor group applicable even though Waste cites none of its sources. The missing group is _12/_14/_16, so both outputs produce:

```
reason: incomplete_citation_support
field: leaks[1].evidence_refs
trigger: intervention_binding
returned: _17, _18, _19
required/missing: _12, _14, _16
```

There is no direct category/intervention compatibility branch and no mismatch error category. The error therefore accurately describes the check that fails, rather than the higher-level generation mistake. Numeric validation is never reached by the real handler for these outputs; the previously saved supplementary inventory found no numeric problems.

Static inspection also shows that category mismatch alone would not fail this reference validator if the complete Labor source group were cited. This is a contract gap, not evidence that either observed run was accepted. The downstream authorization builder already resolves authorized records from complete cited source-ID coverage and unique matches, rather than trusting intervention_ref; it also does not currently test category. No downstream code was invoked or changed here.

## General fixes compared

| Option | Reliability/generalization | Architecture impact / amount of code | Accidental authorization risk |
| --- | --- | --- | --- |
| A: further prompt hardening | Probabilistic; the explicit category rule already failed. No guarantee across judge notes. | Tiny prompt diff, but repeated evaluation needed; schema contradiction remains unless separately addressed. | Existing rejections remain, but prompt cannot structurally prevent a wrong complete-support association. |
| B: optional/absent when unsupported | Null already works in the provider contract; repeating that choice does not remove the model decision. Omitting is accepted by local legacy shape/types but **not** the actual provider schema, which requires the key. Making it optional requires a schema change and remains probabilistic when a wrong non-null value is returned. | Small for optionality/consistent schema; category-conditioned schema would be additional structural work rather than optionality alone. | Null alone grants nothing, but optionality does not forbid cross-category values. Source/policy guards must remain. |
| C: deterministic binding | Identity association is reproducible for every supported controlled intervention and arbitrary source wording; no model-chosen intervention identity. AI category/fact selection can still be wrong, so source validation and fail-closed ambiguity checks remain necessary. | Small localized generation-contract change plus a server-side resolver/tests; more than a prompt edit, substantially less than rewriting Evidence or Scenario. Reuse existing record eligibility and source coverage helpers. | Lowest if binding requires a validated eligible record, category compatibility, complete original-source coverage, and a unique candidate/finding association. Zero or ambiguous matches stay unbound; partial groups still reject. |

## One recommended smallest robust fix

**C — move intervention association out of model generation and into a deterministic Leak-boundary resolver.** This removes the redundant model choice rather than asking the model again to choose a metadata relationship that code can establish.

Conceptual contract:

1. AI emits the semantic category/finding, selected fact IDs and source-bound prose. It does not select intervention identity in the provider generation schema.
2. Preserve existing fact-ID validation, complete support requirements, numeric guards, and explicit authorization eligibility. Resolve refs through existing lineage, never prose.
3. Consider only already validated eligible authorization records compatible with the controlled finding category. Require every required original source ID to be covered by the cited facts, including permission and constraint support. Do not auto-add refs or atoms.
4. Attach an internal intervention identity only when both the candidate match and finding association are unique. Otherwise keep the finding unbound; incomplete required support still fails under existing completeness policy. Never infer permission, intervention equivalence or identity from title/interpretation text.
5. Keep any internal response binding separate from the provider-generated finding contract. This is not rewriting a rejected model binding into an accepted one: the model would no longer be asked to generate that field. Preserve rejection of malformed/unexpected fields under the chosen future contract.

For these exact saved sources this would resolve Labor to its authorized record and leave Waste/Delivery unbound. The rule uses category enums and original-source identities, not Case A wording, numeric values, aliases or fuzzy matching. Multiple scopes/records must be disambiguated by source support; ambiguous or duplicate matches do not authorize anything. Existing type/record limitations remain—this does not create new intervention policy.

This is the smallest **robust architectural** change among A/B/C, not the smallest line-count change. Merely aligning the duplicated null/enum descriptions would be smaller, but would still leave identity selection and category compatibility to generation. That inconsistency should not be mistaken for proof that fixing it alone guarantees reliable bindings.

No implementation is authorized or performed by this diagnosis. A future implementation would need explicit schema/contract/resolver tests and controlled evaluation; no authorization-policy relaxation or source repair is part of the recommendation.

## Verification

No production source changes, live provider calls, retries, repairs, fallback or downstream calls. Both saved outputs reproduce the exact existing validation result locally. The regenerated provider request hash matches both saved request hashes. All **39 production source file hashes remain unchanged** from the start of this diagnosis; source-check.json records them. Only this diagnostic report and reconstructed artifacts were added.
