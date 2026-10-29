# What’s Left?

What’s Left? turns messy business evidence into verified decisions using four specialist AI agents and deterministic validation.

## Architecture

- **Evidence Agent** extracts source-grounded business facts, explicit permissions, constraints, and calculation inputs.
- **Leak Detective** identifies supported margin-leak findings and cites accepted evidence.
- **Scenario Agent** proposes changes within validated authorization boundaries.
- **Decision Agent** recommends actions only within the deterministic Decision Gate’s verified limits.

**AI understands → Code verifies → Code binds identity → Code calculates → AI recommends within verified boundaries.**

The server validates facts, source identity, quantitative claims and authorization before deterministic scenario calculations and decision gating. Missing evidence can produce a completed abstention or a safe validation rejection rather than an actionable recommendation.

## NVIDIA + Nebius

The application calls NVIDIA Nemotron models through **Nebius Token Factory**, using its server-side chat-completions endpoint at `https://api.tokenfactory.nebius.com/v1/chat/completions`.

| Stage | NVIDIA model | Integration |
| --- | --- | --- |
| Evidence | `nvidia/Nemotron-3-Ultra-550b-a55b` | [Evidence route](src/app/api/analyze/evidence/route.ts) |
| Leak primary and corrective retry | `nvidia/Nemotron-3-Ultra-550b-a55b` | [Leak route](src/app/api/analyze/leaks/route.ts) |
| Leak bounded final fallback | `nvidia/nemotron-3-super-120b-a12b` | Same Leak route |
| Scenario | `nvidia/Nemotron-3_5-Lightning` | [Scenario route](src/app/api/analyze/scenarios/route.ts) |
| Decision | `nvidia/nemotron-3-super-120b-a12b` | [Decision route](src/app/api/analyze/decision/route.ts) |

Leak generation permits one corrective retry and one final fallback only for eligible quantitative-output failures, with the same fail-closed validation. It does not retry infrastructure or authorization failures through that flow.

Nebius provides inference at runtime; the web application is hosted on Vercel. Provider credentials stay in server-side environment variables and are never sent to the browser. Optional LangSmith tracing is isolated from analysis correctness; see [integration documentation](docs/integrations.md).

## Local Setup

Prerequisites: **Node.js 22 or newer**, npm, and a Nebius Token Factory account with access to the configured models.

```sh
npm ci
cp .env.example .env.local
```

Set your own credentials in the Git-ignored `.env.local`. Environment variable names:

- **Required:** `NEBIUS_API_KEY`.
- **Optional LangSmith tracing:** `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `LANGSMITH_ENDPOINT`.
- **Optional isolated Toloka review adapter:** `TOLOKA_ENABLED`, `TOLOKA_API_KEY`, `TOLOKA_BASE_URL`, `TOLOKA_PROJECT_ID`, `TOLOKA_DATASET_ID`. These are not required for the application or demo. Review preparation does not automatically submit tasks or start runs.

Keep all API keys server-only. Never commit environment files containing credentials. The tracked `.env.example` contains configuration examples without credential values.

Run locally:

```sh
npm run dev
```

Open the local URL printed by Next.js. Live analysis sends the submitted business note to Nebius and uses provider credit. File selection in the UI is local-only; selected files are not analyzed.

Build and run the production server:

```sh
npm run build -- --webpack
npm start
```

Run offline tests and checks:

```sh
node --test tests/*.test.mjs
npm run lint
npx tsc --noEmit --incremental false
```

Run TypeScript after the build has generated Next.js types. Webpack is the verified build path. Offline tests use mocked transports and synthetic saved responses; they do not require provider calls.

Live evaluation scripts under `scripts/evaluation/` are separate opt-in operations that may incur provider costs. Some historical scripts require local captures intentionally excluded from Git.

## Demo

- **Production:** https://whats-left-rho.vercel.app/
- **Demo video:** https://youtu.be/0pu7VOUXQZg

## Verified Demo Case

The demonstrated Labor case supplies Tuesday-evening sales of USD 8,000/month, staffing cost of USD 2,500/month, and an explicit labor share of 31.25% against management’s 25% target. It also supplies a baseline of four staff members, USD 625 per staff member monthly, explicit permission to test one fewer staff member, and an unchanged-schedule constraint.

After grounding those inputs and binding the authorized intervention, the deterministic calculator evaluates **4 → 3 staff members**, **USD 2,500 → USD 1,875/month**, and a **USD 625/month staffing-cost reduction**. This is a bounded test scenario, not a guarantee of realized profit or unchanged sales.

## Safety / Verification

- Source and numeric grounding reject unsupported values, incompatible units and unsupported quantitative comparisons. The system does not accept model-derived arithmetic as a source fact.
- Explicit permissions and constraints must satisfy the existing authorization contract. Intervention identity and cited support are bound before a scenario becomes eligible.
- The [scenario calculator](src/lib/scenario-calculator.ts) uses validated inputs for deterministic calculations; missing trusted inputs remain unavailable.
- The [Decision Gate](src/lib/decision-gate.ts) constrains the final recommendation to verified scenarios and calculations. Missing inputs, conflicts and rejected output cannot manufacture authorization or savings.
- Bounded provider correction retains the same validators; exhausted or ineligible failures stop safely.

Architecture reports and synthetic regression fixtures are in `docs/` and `tests/`. The [final acceptance report](docs/evaluations/judge-style-final-acceptance/report.md) distinguishes safe rejections from accepted-output safety failures. Reports may reference unpublished local captures; raw evaluation archives, credentials and build caches are excluded.

## License

[MIT](LICENSE) — Copyright (c) 2026 Ting.
