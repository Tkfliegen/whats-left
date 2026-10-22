# Final demo blocker fixes

## Source-bound Scenario authorization

Stable internal authorization identities replace leak-title/category eligibility:

- `tuesday_evening_headcount_reduction`
- `ingredient_waste_rate_target`

These IDs are deterministic constants for the supported permission families,
never model-generated or derived from display titles. The existing `target_leak`
field still copies the confirmed finding's title for the unchanged output
contract. Matching that label back to its authorization during output validation
is a contract join, not a title-based eligibility rule.

Permission still comes only from the exact recognized direct operational-context
statement. Evidence-model facts, leak interpretations and citations cannot grant
permission by themselves. The binding also requires the confirmed finding's
citations to match the relevant authoritative problem evidence.

Labor evidence uses a narrowly specified Tuesday-evening sales/staffing source
sentence. Its numeric strings are copied, never calculated or compared. A
finding must cite the complete source sentence, the known shorter sentence view,
or both exact sales and staffing clause views. The clause projections cover the
recorded live split citations; they are finite literal views of the same source,
not fuzzy matching or free-form prose interpretation. Amounts must match source
strings. Labor results must cite both the bound problem source and the explicit
headcount permission ref, with the existing -1 delta/from-null/persons contract.

Waste requires authoritative current/target rate evidence (combined or the two
recognized split statements), the exact waste permission and matching finding
citations. It retains the 9 → 5 absolute-target contract. Delivery has no adapter.

Category/title variants neither grant nor revoke permission. Unknown evidence,
missing permission, forged provenance, competing findings claiming one identity,
and evidence ambiguously claiming multiple identity families fail closed.
Existing structural validation and controlled-change checks remain intact.

## Decision prose grounding

The guard covers recommendation title/rationale, every comparison assessment and
every priority-input explanation. It adds these deterministic checks:

- Candidate/scenario subjects cannot be said to meet/pass/exceed/cross or be
  above/below an action/decision threshold (including the generic “threshold”).
  The existing impact/savings/result/value checks stay active. Comparison-gap
  and Decision Gate/policy wording remains allowed.
- When `top_candidate_id` is null, top/leading/highest-ranked/selected/recommended
  candidate references reject, except explicit whole-clause absence statements
  such as “No top candidate exists” or “There is no leading candidate”. A nearby
  negation does not excuse a separate positive claim.
- When a top-candidate claim explicitly names a candidate ID, it must be the
  supplied top ID. Grounded top-candidate wording remains allowed when non-null.
- Raw internal enum values are rejected in prose. Structured enum fields are
  unchanged and continue to use their exact schema values.

The Decision prompt states these constraints and gives safe natural-language
examples. There is no additional model, assignment change, output rewriting,
candidate insertion, silent retry or repair. The existing route returns explicit
HTTP 502 validation failures with deterministic reasons. Unsupported-consequence,
financial-copy, coverage, provenance and Gate compliance guards remain active.

These are bounded phrase/source adapters, not general semantic truth proofs.
New source formats or paraphrased citations outside the documented literal views
still fail closed; additional support would require deliberate tests and review.

Frontend, formulas, Gate policy/threshold, shared output contracts and the
request/animation workflow are unchanged.
