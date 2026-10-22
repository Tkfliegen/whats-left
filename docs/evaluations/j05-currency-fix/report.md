# J05 explicit currency parser correction

## Scope and parser change

Only `src/app/api/analyze/evidence/currency.ts` changed in production. Text currency-field parsing still requires an explicit `Currency:` / `Business currency:` header (including the existing notes prefix and newline-value format). Headers are scanned independently at line boundaries or punctuation-plus-space boundaries, so repeated inline declarations remain conflict checked.

A three-letter currency token terminates at end of value, a final period, a period followed by sentence text, or a comma followed by a labeled field. Other malformed values remain whole invalid context values rather than being silently shortened. The existing supported-code set still rejects unsupported tokens; multiple distinct declarations still reject. JSON field handling, extracted-currency aliases and normalization rules are unchanged. No arbitrary prose token scraping is introduced.

Examples covered: `Currency: USD. The reporting period is the month just ended.` → USD; `Currency: USD` → USD; `Currency: EUR.` → EUR; `Currency: GBP, reporting period: last month` → GBP. Repeated conflicting declarations after periods, commas, semicolons or newlines reject. Unsupported CAD/XYZ and malformed value lists (USD / EUR, USD, EUR), extended codes and empty declarations reject.

## Files

- Production: `src/app/api/analyze/evidence/currency.ts`.
- Tests: `tests/currency-normalization.test.mjs`.
- Evaluation artifacts: this directory (one-case manifest, exact saved payload, raw responses, results, source checks, verification and report). Existing harness reused without modification.

## Tests

Added currency sentence termination, terminal punctuation, comma-labeled fields, notes prefix, repeated same-code fields, inline/newline conflicts, unsupported codes, malformed/ambiguous values and a route regression using the exact saved J05 source note. Route regression checks one fetch, unchanged provider source text, unchanged financial fields and canonical USD.

Focused currency plus Evidence route/provider diagnostic/authorization diagnostic/provenance tests: **153 pass / 0 fail**. ESLint and TypeScript pass. Existing normalization, aliases, currency conflicts and valid structured-input tests remain green. No full twelve-case run was made.

## Single live production-path J05 run

Before (latest full-suite artifact): Evidence HTTP502, `Evidence currency conflicts with the explicit source currency or is unsupported.` The text parser consumed `USD. THE REPORTING PERIOD IS THE MONTH JUST ENDED` as a currency code.

After: Evidence HTTP200, canonical USD. Exactly the saved J05 payload was submitted once through the normal browser app using unchanged configured production providers/models. No isolated mock acceptance, retries, repairs, fallback or alternate model. The browser reached Complete after genuine Decision HTTP200. End-to-end latency **16.687s**.

| Stage | HTTP | Browser round-trip latency |
| evidence | 200 | 2.385s |
| leaks | 200 | 1.919s |
| scenarios | 200 | 7.196s |
| simulate | 200 | 0.041s |
| decision-gate | 200 | 0.038s |
| decision | 200 | 1.611s |

Evidence assembled only the source-backed, explicitly authorized Waste rate change (9%→5%). Labor and Delivery remained unauthorized. Leak cited the Waste baseline, target and permission, resolving `waste_rate_target`. Scenario preserved that exact change. Calculator returned `not_calculable_yet` for missing authoritative calculation inputs; no savings were fabricated. Gate returned `needs_more_data`; Decision returned `collect_data`, no selected candidate. Accepted Evidence business totals were null. No first failing stage or new validation rejection/accepted grounding issue was observed in the saved outputs. This one run establishes J05 smoke acceptance, not general model reliability.

## Scope verification

Against the immediately preceding evaluation manifest, currency.ts is the only changed production file. Source remained unchanged during the live submission. Exact model IDs and saved J05 payload are unchanged. Evidence grounding/totals behavior, model/prompt, Leak, Scenario, authorization, binding, calculator, Gate, Decision, frontend, provider configuration and timeouts are untouched. No retries, repairs or fallbacks introduced.
