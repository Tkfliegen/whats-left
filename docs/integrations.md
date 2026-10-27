# Optional observability and human review

The six production analysis routes retain their original handlers, prompts,
models, timeouts, response bodies, validation, authorization and calculations.
Instrumentation is an outer wrapper. No LangChain/LangGraph migration is used.

## LangSmith

Dependency: `langsmith` 0.11.1 (direct SDK `Client` and `RunTree`). See the
[official RunTree reference](https://reference.langchain.com/javascript/langsmith/index/RunTree).

Copy the blank settings in `.env.example` to the server environment:

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<server-only key>
LANGSMITH_PROJECT=whats-left
# LANGSMITH_ENDPOINT=<optional SDK API endpoint>
```

The example defaults tracing to false. Missing keys disable tracing even when
its flag is true. No credentials are added to `.env.local` by this change.

`src/lib/observability/langsmith.ts` owns SDK access and observation. Each Evidence
request starts one root named `whats-left-analysis`. A signed, expiring opaque
context travels in `x-whats-left-trace` response/request headers. It is unrelated
to Evidence provenance and never participates in business validation.
The SDK constructs a stable root dotted order from the same signed start time
and UUID across requests; no process-local session registry or persistence is
required.

Recorded spans:

- `evidence-agent`
- `leak-detective`
- `scenario-agent`
- `scenario-authorization` (existing deterministic input/authorization assembly)
- `scenario-authorization-validation` (existing semantic support validation)
- `scenario-calculator`
- `decision-gate`
- `decision-agent`

Authorization assembly still occurs before the Scenario model, and support
validation still occurs afterward, exactly as the original handler implements.
No stages are reordered to make a diagram appear sequential.

Trace data is metadata only: stage/model, measured duration, HTTP status,
accepted/rejected outcome, known validation/provider error categories, a bounded
business-type vocabulary, and controlled Gate/Decision statuses. Upstream error
statuses/timeouts that the original generic response cannot distinguish remain
unclassified (`provider_unavailable_or_invalid_response`); no unsupported
inference is made. Inputs/outputs sent to the SDK are empty and SDK masking is
also enabled. No prompts, notes, business numbers, provider completions,
reasoning, authorization headers or API keys are serialized to traces.

Uploads are registered with Next.js `after()` and do not gate the business
response. SDK timeouts are 1.5 seconds with zero SDK retries; **these settings do
not change any analysis-provider timeout or retry behavior**. SDK import,
scheduling, metadata processing and transport failures are caught. Development
logs contain only controlled enablement/failure reasons.

The frontend transports the opaque header without changing any analysis body.
When a context exists, it also sends a fire-and-forget, metadata-only completion
notification to `/api/observability/analysis` for success, failure or cancellation.
This catches frontend-only validation failures that occur after a backend 200.
Disabled/missing-key tracing supplies no context and makes no extra request.
For the correlated frontend pipeline, `/api/observability/analysis` via
`completeTrace()` is the exclusive root-completion owner. Route wrappers upload
completed child spans, including Decision and HTTP-error spans, but never patch
the correlated root. Evidence starts the correlated root; non-browser callers
continuing that analysis must also send one completion notification. A direct
isolated non-Evidence request without a valid context still receives its own
standalone root, completed by its route wrapper.

Tracing is best effort: a closed tab, host shutdown, timeout or lost notification
can leave an incomplete/partial trace. This must never trigger a business retry,
fallback, repair or rejection. The frontend sends one terminal notification per
analysis. Detached Decision upload and frontend completion can run in either
order without issuing two root updates. There is no process-local completion
deduplication or new retry behavior.

## Toloka

`src/lib/review/toloka.ts` is isolated from all production analysis imports.
There is no frontend button, submission endpoint, remote dataset mutation,
project/pipeline creation or paid-run creation.

```dotenv
TOLOKA_ENABLED=false
TOLOKA_API_KEY=<server-only key, only for explicitly invoked connection checks>
TOLOKA_BASE_URL=https://platform.toloka.ai
TOLOKA_PROJECT_ID=<optional existing ID>
TOLOKA_DATASET_ID=<optional existing ID>
```

`getTolokaStatus()` is an explicitly invoked, read-only `GET /api/v2-beta/me` using
`Authorization: ApiKey …`. It returns a safe availability status and team count,
not account email, team IDs or raw response bodies. The configurable base must
use HTTPS and redirects are rejected. One request is made, with a five-second
integration-only timeout and no retry. The endpoint/authentication follow the
[official deployed API reference](https://platform.toloka.ai/api/v2-beta/scalar)
and [connection guide](https://platform.toloka.ai/docs/integration/programmatic-access/).

`normalizeReviewPayload()` projects an accepted analysis into a detached local
payload: analysis ID, business type, lightweight source summary, structured
Evidence, cited fact ID/text pairs, accepted findings, Scenario/Decision statuses,
controlled review reason and creation time. Full original source input,
unreferenced provenance and raw provider/transport objects are excluded.
Business context intentionally remains in the local payload for human review.
Only pass already-accepted production objects to this service.

`prepareTolokaReview()` checks the explicit flag/key and returns the local
normalized payload plus optional existing project/dataset IDs and
`submitted: false`. It makes no network call. The allowed reasons are
`needs_more_data`, `low_confidence`, `evaluation`, and `explicit_review`.
No eligibility metadata is inserted into production outputs and no review
result can modify a production Decision. Actual submission is intentionally
not implemented in this phase; the beta API can be integrated later under
separate explicit authorization.

## Verification

All integration tests use isolated environments and mocked transports. They
exercise enabled/disabled/missing-key cases, SDK/scheduler/API failures,
distributed hierarchy and signed context, privacy, unchanged full frontend
analysis bodies/stage ordering, unchanged deterministic route outputs, local
review normalization, read-only connectivity, and zero automatic submission.
No live LangSmith, Toloka or model-provider calls are needed for these tests.

## Files and local results

New integration files:
- `src/lib/observability/langsmith.ts`
- `src/lib/observability/client.ts`
- `src/app/api/observability/analysis/route.ts`
- `src/lib/review/toloka.ts`
- `.env.example`
- `docs/integrations.md`
- `tests/observability.test.mjs`
- `tests/observability-client.test.mjs`
- `tests/toloka-review.test.mjs`

Existing files changed for this task:
- `package.json`, `package-lock.json` (LangSmith SDK plus its four transitive packages only)
- `.gitignore` (allow the blank `.env.example`)
- The six `src/app/api/analyze/*/route.ts` handlers (outer observer exports; two synchronous Scenario observation wrappers)
- `src/components/use-demo-analysis.ts` (opaque header transport and best-effort completion only)
- `tests/helpers/analysis-harness.mjs`, `tests/evidence-route.test.mjs`,
  `tests/decision-gate.test.mjs`, `tests/scenario-calculator.test.mjs`
  (isolated loader/environment support for the new imports)

The prior uncommitted UI changes are retained and are not integration changes.

Verification at implementation: 118 focused tests passed; 900 full-suite tests
passed; ESLint, standalone TypeScript and `next build --webpack` passed.
The original six route handler bodies were compared against HEAD after removing
only observer wrappers/imports and matched exactly. All original prompts,
validators, provenance/binding/authorization implementations, calculator, Gate,
Decision logic and output types remain unchanged. No live external integration
or model-provider calls, paid operations, commits or pushes were performed.
