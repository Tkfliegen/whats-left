# Judge demo runbook

## Responsible uncertainty — live Cornhead

Use the existing Cornhead fixture facts in the Business Input notes, with an
explicit source header:

```text
Currency:
USD
```

Keep all original amounts and permissions. Do not add headcount, per-worker cost
or ingredient purchases: these omissions are intentional. Expected product
story: the system preserves uncertainty and asks for authoritative inputs rather
than inventing savings or an action winner. See the final verification report:
the current exact authorization binding can leave Labor not simulation-ready.
Do not promise a particular live leak title or the exact two-scenario split.

## Complete structured inputs — synthetic demonstration

`tests/fixtures/complete-close-call.json` supplies 4 workers, USD 770 per worker,
USD 20,000 ingredient purchases, delta -1 and waste 9% → 5%. The existing formulas
produce USD 770 versus USD 800 and the unchanged Gate requires decision context.

`tests/fixtures/complete-clear-winner.json` supplies 4 workers, USD 2,500 per
worker, USD 12,500 purchases and the same authorized changes. The existing
formulas produce USD 2,500 versus USD 500; the Gate allows a Labor recommendation.

These are openly synthetic fixtures, not Cornhead data. They are validated by
production Scenario authorization, Calculator and Gate logic. The current form
does not transport structured calculation inputs, so do not portray this as a
live prose-extraction demo. No demo branches exist in production frontend code.

Local, zero-credit checks:

```sh
node --test tests/demo-fixture.test.mjs tests/decision-frontend.test.mjs
```

Live verification tooling is explicit opt-in, requires local Next dev on port
3000 and an isolated Chrome DevTools session on port 9223:

```sh
node scripts/verify-demo-browser.mjs --cornhead
node scripts/verify-demo-browser.mjs --actionable
```

The first submits one full real app analysis (four provider calls). The second
uses fixture Evidence/Leak/Scenario and makes real Calculator/Gate/Super calls
(one provider call). Neither retries. These commands incur provider usage and
must not be rerun as a reliability batch. The final requested live runs have
already been performed; use their saved artifacts for review.

`check-demo-report.mjs` rechecks saved reports offline without new provider calls.
A successful HTTP flow is distinguished from unmet demo-readiness expectations.
The final report documents both known issues; do not claim they were repaired.
