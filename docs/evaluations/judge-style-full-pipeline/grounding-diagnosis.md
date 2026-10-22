# Grounding diagnosis: 12-case production stress test

## 1. Executive summary

Diagnosis only, using saved runs and the unchanged production contracts. No new provider calls were necessary. Results remain **1 PASS / 0 PARTIAL / 11 FAIL**, with six frontend completions. Completion is not a correctness score.

The five grounding escape cases split into two overlapping patterns:

- **Evidence totals lack source-bound role/scope validation:** J02 and J09 promote partial-period amounts into business totals; J02 also derives an unreported sum.
- **Scenario abstention explanations lack grounding:** J02, J03, J06 and J07 accept the identical Waste-specific 5% sentence for Labor or Delivery. J02/J03/J06 have no source-reported Waste 5% target at all. J07 has one, but it belongs to Waste, where permission actually exists.

These are application trust gaps, not demonstrated failures of the deterministic authorization/calculation controls. No invented permission, unsafe authorization, incorrect trusted intervention binding, invented operational intervention, fabricated savings or Gate violation was observed. Four additional cases stopped on application validation; two stopped near the provider deadline. Those six failures must not be conflated with the five accepted grounding escapes.

A shared source-bound typed-claim abstraction could cover numeric value, unit, role and scope across both patterns. It is larger than necessary for the immediate majority: code-owned Scenario abstention explanations, based only on verified structured state, would fully address the observed escape in J03/J06/J07 (three of five cases), and remove the secondary Scenario escape in J02. It would not fix J02/J09 Evidence totals. The recommendation is specified only after the diagnosis below.

## 2. Failure matrix

Paths are relative to each stage's result object. `—` means unavailable or inapplicable, not an inferred value. Categories A–H follow the request: source, numeric, unit, scope, derivation, false rejection, provider/schema, stochastic. Application failures include accepted semantic errors. Safety column refers to authorization/action/calculation safety; it does **not** imply explanatory correctness.

| Case | Final | First causal failing stage / field | Reason / category | Token; unit | Source/fact refs | Scope | Provider/application | Fail-closed safety |
|---|---|---|---|---|---|---|---|---|
| J01 | PASS | None | All acceptance checks passed | — | Valid Labor grant support | Tuesday Labor | Neither | Yes |
| J02 | FAIL | Evidence `revenue.total`, `costs.total` | Unreported aggregate and scope promotion; A/B/D/E | 10000; 3300 USD | No field refs; source components in §3 | Shift → business | Application, accepted | Actions closed; summary escaped |
| J03 | FAIL | Scenario `not_simulation_ready[0].reason` | Invented Waste target and wrong missing condition; A/B/C/D | 5% | None attached; no source target | Waste → Labor | Application, accepted | Yes; explanation escaped |
| J04 | FAIL | Leak `insufficient_evidence[0].reason` | `unreported_number`; A/B | 6; unit not retained | Rejected refs/body not retained | Unsupported time/context | Application, rejected | Yes |
| J05 | FAIL | Evidence currency normalization of request `input` | Currency field parser consumes trailing sentence; F/contract transformation | USD plus prose | Explicit original currency line | General business | Application, false rejection | Yes, but valid input blocked |
| J06 | FAIL | Scenario `not_simulation_ready[0].reason` | Invented Waste target; A/B/C/D | 5% | None; no source target | Waste → Delivery | Application, accepted | Yes; explanation escaped |
| J07 | FAIL | Scenario `not_simulation_ready[0].reason` | Wrong category and permission assertion; A/D | 5% | No reason refs; Waste fact in §3 | Waste → Delivery | Application, accepted | Yes; explanation escaped |
| J08 | FAIL | Leak `leaks[0].interpretation` | `unreported_number` in finding's cited set; B | 2026; exact usage unavailable | Year exists globally; rejected finding refs unavailable | Date/context → finding | Application, rejected | Yes |
| J09 | FAIL | Evidence `revenue.total`, `costs.total` | Scoped amounts treated as business totals; A/D | 1650; 2750 USD | No field refs; original source `_04` in §3 | Tuesday → business | Application, accepted | Actions safe; summary escaped |
| J10 | FAIL | Scenario result; exact child path unknown | Deterministic structural validation rejected; G, finer cause unknown | Unknown | Rejected body unavailable | Cost-only insufficient evidence | Application, rejected | Yes |
| J11 | FAIL | Scenario provider boundary | Generic catch; suspected deadline, not proven | — | No output accepted | Contradictory Labor | Provider boundary; precise cause unknown | Yes |
| J12 | FAIL | Scenario provider boundary | Generic catch; suspected deadline, not proven | — | No output accepted | No established leak | Provider boundary; precise cause unknown | Yes |

First failures are counted once. In particular, J02's later Scenario explanation is analyzed but is not a second failed case. No unreached downstream stage is counted as failing. H (stochastic behavior) is not established by this single-run stress sample.

## 3. Five escape traces

Identifiers below are exact. For compactness, `fact_<digest>_NN` and `src_<digest>_NN` share an ordinal only where the saved provenance explicitly links them. `input_*` and `ev_*` identify packaged/model-derived data, not independently proven original-source claims.

### J02: derived revenue and promoted shift cost; later phantom Waste explanation

Evidence outputs exact scalars `revenue.total = 10000`, `costs.total = 3300`. There is no prose at these scalar paths and no attached citation field.

Original sources:

- `src_8a2d0cccde8390de52c251333917038b_04`: “Our Tuesday 6 PM to 10 PM service sold USD 2,100 and cost USD 3,300 in staff pay.”
- `src_8a2d0cccde8390de52c251333917038b_06`: “Friday evening had 5 staff and USD 7,900 in sales for the month.”

Corresponding citable facts are `fact_8a2d0cccde8390de52c251333917038b_04` and `_06`. They support scoped sales and Tuesday staffing cost, not whole-business totals. 2100 + 7900 = 10000 is mathematically correct; it is neither an explicitly reported business total nor necessarily an exhaustive revenue set. 3300 is explicitly reported USD, but only for Tuesday staffing. No currency conversion occurred; role/scope changed. The accepted summary becomes Scenario `input_04` (revenue total) and `input_07` (cost total), with corresponding descriptive provenance IDs. Wrapping a generated value in an ID does not establish its source truth.

Later Scenario exact `not_simulation_ready[0].reason`:

> Missing explicit permission to test reducing waste toward the stated 5% target.

Destination is Labor. Its Leak refs are exactly `fact_8a2d0cccde8390de52c251333917038b_04`, `_05`, `_06`, `_07`. `_05` reports **5 staff**, not 5 percent. There is no Waste target fact, and Scenario reason has no citation field. Classification: invented target/unit/category claim, not a source-backed unit conversion. The note explicitly withholds a staffing experiment; the trusted state correctly contains no grant.

### J03: phantom target and wrong explanation of the actual missing requirement

Exact Scenario path `not_simulation_ready[0].reason` has the same quoted sentence above. The asserted value is **5 percent, Waste**, applied to **Labor**. No source or fact ID supports that target.

Labor Leak refs: `fact_3a3926b74bdefcf30b3e195d097e22fe_03`, `_04`, `_05`, `_06`. They support Tuesday USD1800, Tuesday USD3000/4 workers, Friday USD6900/4 workers, and explicit one-person trial permission. Original `_07` says no limits on remaining schedule changes have been decided; `_08` says operational constraints remain unresolved. Assembly diagnostics correctly report only `schedule_constraint` missing, with permission present. Thus the Scenario sentence is wrong in category, number and missing-condition meaning. No arithmetic is involved. No reason refs exist.

### J06: a Delivery abstention invents a Waste target

Exact Scenario `not_simulation_ready[0].reason` again equals the quoted sentence. Destination is Delivery, whose Leak cites `fact_aba185e5a3c2255ac7a668ef24b70d3a_04` and `_05`: average delivery revenue **USD22.80 per order**, and some combined order costs exceeding order revenue. No Waste or 5% fact exists. Delivery changes are explicitly unapproved. The scalar 5% is otherwise introduced, not derived or reported. There are no Scenario reason refs.

### J07: real Waste target applied to Delivery, then echoed by Decision

Exact Scenario `not_simulation_ready[0].reason` is again the quoted sentence. Destination Delivery Leak refs are:

- `fact_767d7e2bbfb8ba9558014cb08f234601_04`: some delivery orders lose money;
- `fact_767d7e2bbfb8ba9558014cb08f234601_05`: average delivery revenue USD19.60;
- `fact_767d7e2bbfb8ba9558014cb08f234601_06`: no delivery policy/pricing change approved.

Actual Waste target is `fact_767d7e2bbfb8ba9558014cb08f234601_07`, backed by `src_767d7e2bbfb8ba9558014cb08f234601_07`: “Ingredient waste is measured at 9%; the internal target is 5%.” Waste permission is separately `_09`: “I authorize a controlled waste reduction trial from 9% to 5% in this category.” Waste finding refs are `_07`, `_08` (USD16000 purchases), `_09`; its grant and binding are correct.

Thus **5% is reported, but belongs to Waste**, not Delivery. It is not in the Delivery finding's refs, and no refs attach to the Scenario reason. Claiming missing Waste permission is also false: Waste permission exists. No derivation or unit transformation is required to explain the error; this is category/relationship contamination (or reuse of the prompt's identical example; the model's internal causal choice cannot be recovered).

Gate carries the explanation through. Decision `comparison[1].assessment` says exactly:

> Not simulation ready due to missing explicit permission to test reducing waste toward the stated 5% target.

Decision's global input-number guard accepts 5 because it already occurs in its supplied Scenario/Gate context. This is propagation, not a second independently invented target or a Gate policy violation.

### J09: numerically reported values acquire an unsupported total role

Evidence exact scalars `revenue.total = 1650`, `costs.total = 2750`, both USD. Original `src_c1f82f94b8eb7a4a6440e229a406a34e_04` / `fact_c1f82f94b8eb7a4a6440e229a406a34e_04`:

> The Tuesday late sitting, 6 PM until 10 PM, took USD 1,650; wages assigned to that sitting came to USD 2,750.

Friday source/fact `_06` separately reports USD6800 and five staff. Neither total is explicitly reported as the business's monthly total. No arithmetic or conversion occurred: copied amounts changed scope and role. No total-field source refs exist. Evidence even lists missing total monthly business revenue/cost information, contradicting its own scalar totals. Scenario packages these as `input_04` and `input_06`, respectively. Correct Labor permission/constraint sources `_07`, `_08`, `_09` produce the expected grant; that does not validate the separate summary totals.

### Why acceptance allowed these escapes

Evidence shape checks accept numeric/null totals; ordinary totals have no required source-bound value/role/scope record. Currency normalization does not validate what a USD amount measures. Source-derived citable facts are safe identities, but model summary fields are returned alongside them without the atom checks.

Scenario validates title coverage, finite changes, known available-input IDs, exact authorized change support and required grant coverage. For `not_simulation_ready.reason`, it checks nonblank text, not numeric/source/unit/category grounding. Thus structural and action safety can pass while an explanation is false. Decision checks Gate/candidate boundaries, provided numbers and specific prohibited claims; it does not re-ground every assessment to original field-specific source facts.

## 4. Evidence total-generation boundary

| Case / output | Original components | Arithmetic | Source explicitly states this business total? | Downstream treatment |
|---|---|---|---|---|
| J02 `revenue.total=10000` | Tuesday2100 + Friday7900 USD | Correct sum, unsupported exhaustive aggregation | No | Available global Scenario input; summary consumers receive non-null total |
| J02 `costs.total=3300` | Tuesday staff pay3300 USD | No arithmetic; single scoped cost promoted | No | Available total despite missing other business costs |
| J09 `revenue.total=1650` | Tuesday1650; Friday6800 USD separately reported | No arithmetic; Tuesday only | No | Available total, despite explicit missing-total description |
| J09 `costs.total=2750` | Tuesday wages2750 USD | No arithmetic | No | Available total, not proof of whole-business costs |

These are all unreported totals identified in the reviewed artifacts. Other cases' null totals or explicitly reported business totals are not failures. J01/J12 reported cost components are not licenses to derive unreported outputs.

Existing generic citable facts carry `{id,text,source_refs}`, not typed amount/unit/period/scope/role. They preserve the original evidence but do **not** already contain enough machine-readable structure to distinguish a Tuesday subtotal from a monthly business total without semantic extraction. Matching digits would block J02's new 10000 but would not block J09's existing digits. Descriptive provenance generated from accepted output is not independent validation.

The exact dual standard is Evidence route's atom assembly/record validation versus ordinary base Evidence fields: atoms receive controlled types, known original source IDs, numeric anchors, compatible units/currency/scopes, uniqueness and permission/constraint assembly requirements. Base totals/items/descriptive facts mainly receive schema/type checks and currency normalization. The route then returns them together. Atom checks themselves do not prove arbitrary source semantics: AI still classifies permission polarity, role and schedule meaning; ID/anchor checks verify structural support, not complete natural-language entailment.

## 5. Cross-scope contamination: what is proven

`buildScenarioInput` in `src/app/api/analyze/scenarios/scenarios.ts` supplies:

- flat `input_facts: [{id,source,fact}]` drawn from Evidence totals/items/facts, operational context, Leak evidence and provenance items;
- `confirmed_leaks`: **title strings only**, omitting Leak category, evidence refs and binding;
- `authorized_changes`: trusted action entries with target title, authorization/variable identity, operation, values/unit and source refs.

The source path indicates origin, not a validated semantic unit/category/scope. A Scenario reason has neither per-field refs nor a category-compatible citation requirement. A model therefore sees global fact text while the output contract does not structurally tie a reason's claims to that finding's evidence. J07 demonstrates this missing relationship: real Waste5% is globally visible, absent from Delivery refs, yet accepted in a Delivery reason.

However, **global fact availability is not the origin of every 5%**. J02/J03/J06 have no Waste5% source ID. The Scenario system prompt contains this exact example at line171: “Missing explicit permission to test reducing waste toward the stated 5% target.” It explicitly says to mention the value only when supplied. The three outputs reproduce that sentence despite absent supporting facts. Prompt-example contamination is a concrete available origin; we cannot prove internal model token provenance. J02's five-person source is not evidence for a percentage.

This resembles the old global-intervention problem only at the trust-boundary level: existence in context (or in a prompt example) is mistaken for applicability to a finding. Current intervention identity is resolved by code with category/authorization/lineage/uniqueness checks. Scenario free-form reasons lack an equivalent relationship. No incorrect trusted binding occurred here; do not infer that binding resolver regressed.

## 6. Four application validation failures

| Case | Exact retained diagnostic / response | Assessment and limits |
|---|---|---|
| J04 | `{reason:"unreported_number",field_path:"insufficient_evidence[0].reason",normalized_number:"6"}`; HTTP502 `Leak analysis result rejected by output validation: unreported_number.` | Correct fail-closed numeric rejection against trusted source catalog. Source note has no time6. Evidence `missing_information[3..4]` introduces Tuesday6–10 questions; possible context origin, not proven exact rejected wording. Raw rejected prose was not retained. Questions are not asserted financial facts, so not an extra accepted escape case. |
| J05 | HTTP502 `Evidence currency conflicts with the explicit source currency or is unsupported.` | False rejection in deterministic input transformation. Explicit line is `Currency: USD. The reporting period is the month just ended.` Currency source regex captures full line remainder, yielding `USD. THE REPORTING PERIOD IS THE MONTH JUST ENDED`, not supported codeUSD. Offline saved check still fails when extracted currency is forcedUSD. No evidence the provider chose wrong currency; no need to rerun. |
| J08 | `{reason:"unreported_number",field_path:"leaks[0].interpretation",normalized_number:"2026"}`; same Leak502 text | Guard correctly rejects lack of token support in that finding's resolved cited set. Year2026 exists globally in original dates; global presence is not sufficient. Exact prose/unit and rejected refs were not retained, so cannot assert which citation the model omitted or whether it described a year/version/etc. No evidence of parser bug or justification to exempt dates. |
| J10 | HTTP502 `Scenario analysis result rejected by deterministic validation.` | `validateScenarioResult` returned false before semantic authorization validation. Raw rejected result/path not retained. Could be schema, coverage, references or other structural condition; exact defect and possible false rejection cannot be established. Correct fail-closed route behavior; insufficient evidence to declare validator bug or a specific hallucinated intervention. |

J05 is an independent currency contract bug, not a shared semantic-grounding redesign requirement. J10 remains an observability limitation. All three cases with empty Leak findings (J10–J12) fail at Scenario, but only J10 has structural-rejection evidence; this pattern does not prove a common schema defect.

## 7. Provider boundary failures

| Case | Stage/model | Stage latency | Configured timeout | App result | Proven cause? |
|---|---|---|---|---|---|
| J11 | Scenario / `nvidia/Nemotron-3_5-Lightning` | 60093ms | 60000ms | HTTP502 `Scenario analysis provider is unavailable or returned an invalid response.` | Suspected timeout, not confirmed |
| J12 | Scenario / same | 60043ms | 60000ms | Same | Suspected timeout, not confirmed |

Total run latencies were 67407ms and 66360ms. The route uses `AbortSignal.timeout(60000)` but its generic catch also covers network, envelope JSON and internal exceptions. No safe exception-name/upstream-status diagnostic was retained. These are **application HTTP502**, not proven provider HTTP502. Near-deadline timing strongly suggests aborts; it does not establish them. Neither run accepted a Scenario output; there is no evidence connecting these failures to numeric/scope grounding. No retry recommendation follows from these two observations.

## 8. Current deterministic trust coverage

FULL means enforced for the indicated contract relationship, conditional on upstream trusted inputs; it does not mean deterministic understanding of arbitrary prose. PARTIAL means narrower checks exist but do not prove the whole dimension. NONE means no field-level guarantee. For irrelevant dimensions, NONE means no applicable proof is supplied, not a newly found defect.

| Stage / field | Source identity | Numeric value | Unit | Category/scope | Permission | Intervention identity | Calculation |
|---|---|---|---|---|---|---|---|
| Evidence descriptive model `facts` | NONE | NONE | NONE | NONE | NONE | NONE | NONE |
| Evidence numeric items | PARTIAL | NONE | PARTIAL | NONE | NONE | NONE | NONE |
| Evidence authorization atoms | FULL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NONE |
| Evidence totals/summaries | NONE | NONE | PARTIAL | NONE | NONE | NONE | NONE |
| Original-source citable fact catalog | FULL | PARTIAL | NONE | NONE | NONE | NONE | NONE |
| Leak `evidence_refs` | FULL | PARTIAL | NONE | PARTIAL | NONE | NONE | NONE |
| Leak numeric prose | FULL | PARTIAL | PARTIAL | PARTIAL | NONE | NONE | PARTIAL |
| Leak category | PARTIAL | NONE | NONE | NONE | NONE | NONE | NONE |
| Leak resolved intervention binding | FULL | FULL | FULL | FULL | PARTIAL | FULL | NONE |
| Scenario variables / controlled changes | FULL | FULL | FULL | PARTIAL | PARTIAL | FULL | NONE |
| Scenario numeric changes (`from/value`) | FULL | FULL | FULL | PARTIAL | PARTIAL | FULL | NONE |
| Scenario action scope | FULL | FULL | FULL | PARTIAL | PARTIAL | FULL | NONE |
| Scenario `not_simulation_ready.reason` | NONE | NONE | NONE | NONE | NONE | NONE | NONE |
| Calculator verified results | FULL | FULL | FULL | FULL | PARTIAL | FULL | FULL |
| Gate control/candidate result | FULL | FULL | FULL | FULL | PARTIAL | FULL | FULL |
| Decision free-form claims | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Decision numeric claims | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NONE | PARTIAL | PARTIAL |
| Decision selected candidate ref | FULL | FULL | FULL | FULL | PARTIAL | FULL | FULL |

Important qualifications:

- Atom values must occur in cited source text and typed unit/currency/scope fields must satisfy fixed contracts. Semantic roles, permission polarity and scope meaning are model-extracted, hence PARTIAL rather than FULL semantic proof. Schedule constraints have source IDs but no numeric anchor.
- Leak checks known facts and complete authorization-support groups before prose; numeric tokens must occur in that finding's cited facts, with additional rate-unit checks. Token membership is not full claim-role/scope entailment. `insufficient_evidence` uses a global trusted catalog rather than finding-specific refs.
- Binding has a deterministic category compatibility map and unique complete-lineage match. Scenario authorizations separately enforce existing grants and exact action values/units/refs; their matching uses target titles and lineage, not a universal typed category contract for all explanations.
- Calculator uses typed concepts/scopes/units/period/currency and rejects missing/ambiguous deterministic inputs. FULL arithmetic means the fixed formula is correct given accepted inputs. In this evaluation no scenario was calculable; no amount was fabricated to complete one.
- Decision selected reference/verified impact must agree with Gate. Its prose numeric check uses globally serialized Decision input, not field-level original citations. Money claims have stronger verified-impact checks; this does not validate a copied5% explanation.

## 9. Conceptual architectural options

| Option | Prevents / does not prevent observed failures | Generality, impact and size | Overfit and safety |
|---|---|---|---|
| A. More prompt hardening | May reduce copied example/summary errors; guarantees none. Existing prompt already conditions5% on supplied target. Does not close either trust boundary. | Broad notes supported; very small prompt change, stochastic outcome. | High temptation to patch examples; no stronger fail-closed guarantee. |
| B. Numeric guard only | Can reject J02's new10000 and absent5% in J03/J06 (also J02's later reason). Does not catch existing digits assigned wrong role: J09 totals, J07 Waste target, J02 five-person→percentage unless unit-aware. | Small/medium integration across stages; numeric membership is general but incomplete. | Safe rejection improves, but number presence must not become authorization. |
| C. Typed category/scope on citable facts plus compatible citations | Can reject cross-category J07 and unsupported5% if reasons must cite facts. Can stop shift→business promotion only if totals also resolve against scoped roles, not just carry metadata. Does not inherently forbid a new sum. | Medium change to extraction/catalog and consumers; arbitrary scopes need a general representation. | Low overfit if identity-based; metadata without enforced consumers is insufficient. |
| D. Source-bound typed facts `{source_id,fact_id,value,unit,scope/category,role}` with trusted claim resolution | A shared abstraction can address all five grounding cases: explicit-total role, source-bound numeric value/unit, compatible finding scope, permission distinct from target. Does not fix J05 parser or provider failures; J10 unknown. | General across notes; largest change: typed producer, validation, relationships and each consuming field. Reuse IDs and atom concepts. | Low overfit if no sentence rules. AI still extracts semantics; code verifies IDs/types/relationships. Typed labels alone cannot prove arbitrary prose entailment. |
| E. Code-owned Scenario abstention explanations from verified structured state | Fully removes observed escape in J03/J06/J07, plus secondary J02 reason and J07 echo. Does not fix Evidence totals in J02/J09, J05 parser, J10 unknown or provider failures. | Smallest general boundary change for a majority (3/5 fully addressed cases): stop asking the model to invent causal numeric prose where code already knows eligibility. | Low overfit with general reason codes and conservative wording; never infer missing permission from an empty grant set or manufacture target values. Preserves fail-closed authorization. |

D is the shared abstraction for comprehensive source/value/unit/scope grounding. E is a narrower alternative because four offending Scenario sentences are explanations of already deterministic eligibility, not a need for more semantic generation. Merely filtering/replacing the literal5% sentence would not be E; it would be prohibited example-specific repair.

## 10. Exactly one recommended next change

**Make Scenario abstention explanations code-owned projections of verified structured eligibility, rather than trusted model-generated numeric/causal prose.**

Use stable finding identity and existing verified authorization/eligibility state; render a controlled reason without numbers or category-specific facts unless explicitly supplied by a source-bound typed record. An empty eligible-grant set supports only a conservative statement such as “No eligible authorized change is available for this finding.” It does **not** prove permission is absent: J03 has permission but lacks a required constraint. Specific missing-condition wording requires a validated structured reason; do not recover it from source prose, model prose or development logs.

This is an output-contract ownership change, not a post-generation repair, sentence substitution, fuzzy match, retry or relaxed validator. Continue rejecting invalid outputs and preserving exact controlled-change checks. The explanation must not invent actions or alter authorization/simulation eligibility. Relate findings using structured identity, not semantic matching of titles.

It generalizes to arbitrary notes because it expresses known policy state, not a particular business, number, category or wording. It would eliminate the accepted Scenario scope error in **three of five escape cases**, and the secondary error in J02; the J07 Decision echo loses its upstream false premise. J02 and J09 would still require separate source-bound total-role grounding and must not be declared fixed. This smaller next step is preferable to claiming a full typed-fact migration is necessary to correct every policy explanation. No implementation is included here.

## Verification and evidence limits

Sources: [original report](report.md), [final classifications](results.json), [summary](summary.json), [manifest](manifest.json), [currency parser reproduction](currency-parsing-check.json), and saved `runs/J01.json`–`J12.json`. Relevant production boundaries: Evidence `evidence.ts`, `route.ts`, `currency.ts`, `provenance.ts`, `authorization-atoms.ts`, `authorization-records.ts`; Leak `output.ts`/`binding.ts`; Scenario `scenarios.ts`/`authorization.ts`/`route.ts`; calculator, Gate and Decision validators.

Existing rejected bodies are intentionally absent. No prose, refs, upstream status or internal exception not retained in artifacts has been reconstructed as fact. The earlier evaluation-reader error after J10 is documented in `harness-resume.json`; only never-submitted J11/J12 were subsequently run, not retried cases.

All **40 production source hashes match the stress-test manifest**, checked during and after diagnosis. Production models remain Evidence/Leak `nvidia/Nemotron-3-Ultra-550b-a55b`, Scenario `nvidia/Nemotron-3_5-Lightning`, Decision `nvidia/nemotron-3-super-120b-a12b`. No production, prompt, schema, validator or model changes. No retries, repairs or fallbacks introduced. **Zero new live provider calls.** This task adds this report only; prior evaluation's green test/lint/TypeScript/build results are historical, not newly rerun checks.
