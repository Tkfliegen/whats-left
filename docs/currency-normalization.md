# Evidence currency normalization

The Evidence route normalizes the validated model response before returning it.
Only `evidence.currency` changes; amounts, source excerpts, model settings and
prompts stay unchanged. Scenario, Calculator, Gate, Decision and frontend consume
that authoritative result without their own currency inference.

Supported canonical codes are USD, TWD, AED, EUR and GBP. Trim whitespace and
normalize code case. The narrow qualified forms US$, NT$, € and £ map to USD,
TWD, EUR and GBP respectively. Arabic د.إ requires explicit AED context. NTD
and other unsupported forms are not given speculative aliases.

Explicit context means a complete `Currency: USD` or `Business currency: USD`
source line, including a code on the following line. The current input form's
`Business description / notes:` prefix is supported. JSON source fields named
`currency` and `business_currency` with canonical string values also count.
Repeated agreeing fields are allowed. Mixed or unsupported field values reject
with HTTP 502 rather than selecting one. Unlabelled code mentions, business
names, geography, language, user location and browser locale do not count.

A bare `$` maps to USD **only** with explicit USD context. Without context it
becomes null, following the existing unknown-currency contract. With TWD or any
other explicit non-USD context it rejects with HTTP 502: the normalization rule
does not reinterpret a bare dollar sign for another dollar currency.

A recognized extracted code or qualified form must agree with explicit context;
conflicts reject with HTTP 502, with no retry or repair. Missing extracted
currency can be populated from an explicit supported source code. Unsupported
extracted forms without context become null; with explicit context they reject.
This is notation normalization, never currency conversion or value calculation.

Local integration coverage uses an Evidence provider stub returning `$` for
Cornhead source text containing `Currency:\nUSD`, then exercises the real
Evidence, Scenario, Calculator, Gate and Decision routes with provider fixtures.
Canonical USD reaches every downstream request. Cornhead still needs headcount,
per-worker labor cost and ingredient purchases; the missing currency-code input
is gone. Uncalculable candidate/impact currencies remain null under the existing
Gate and Decision contracts. Calculable output coverage preserves USD through
the Calculator, Gate and Decision model input.

No live or external requests are needed for these tests. The normalization
helper itself has no model, network, environment or locale dependencies.
