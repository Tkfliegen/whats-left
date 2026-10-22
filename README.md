# What's Left?

A hackathon business-analysis workspace with an Agent Office UI and a verified analysis pipeline:

Evidence → Leak → Scenario Authorization → Scenario → Calculator → Decision Gate → Decision.

AI extracts and interprets supplied evidence. Deterministic code validates source references, authorizations, supported business totals, intervention identity, numeric claims, calculations and Decision boundaries. Missing or unsupported inputs remain unavailable; the app does not manufacture savings to complete an analysis.

## Local setup

Use Node.js 22 or newer and npm. Install locked dependencies with `npm ci`.

Create an ignored `.env.local` and set `NEBIUS_API_KEY` to your own provider key. Never commit this file or key. The server routes use Nebius; credentials are not exposed to the browser. The current Evidence and Leak model is Ultra; Scenario and Decision use their separately configured route models.

Run `npm run dev`, then open the local URL printed by Next.js. File upload selection in the UI is local-only; uploaded files are not analyzed.

## Offline verification

```sh
node --test tests/*.test.mjs
npm run lint
npx next build --webpack
npx tsc --noEmit
```

Run the TypeScript check after the build has generated Next.js types. The Webpack build is the verified local build path; `npm run build` retains the standard Next.js build command. Build and offline tests do not require real provider calls. Tests include synthetic saved app-response fixtures to reproduce earlier trust-boundary failures.

Live evaluation scripts under `scripts/evaluation/` are opt-in and make provider calls. Browser scripts require a separately running local app and Chrome debugging session. Do not run them as ordinary unit tests or assume they are free of provider cost. Historical comparison scripts may require local captures that are intentionally excluded from Git.

## Assets and evaluation evidence

Runtime artwork is in `public/agent-office/` and the three CSS-imported `pic/whatleft-bk10.png`, `whatleft-bk11.png`, `whatleft-bk13.png` backgrounds. Unused drafts and duplicate source artwork stay local.

Architecture reports are in `docs/`. The final twelve-case acceptance report is [here](docs/evaluations/judge-style-final-acceptance/report.md). It distinguishes correct fail-closed rejections from confirmed production defects; completion alone is not a safety score. Reports may reference local captures that are not published. Only selected synthetic regression snapshots and final acceptance metadata are committed; raw evaluation archives, build output, environment files and caches are excluded.

## Vercel handoff

Connect `Tkfliegen/whats-left`, confirm the intended Production Branch, and configure `NEBIUS_API_KEY` in the Vercel project environment settings. The production branch and deployment status are not recorded in this repository; verify them in the dashboard. Check that the latest Production deployment uses the pushed commit and reaches Ready. A Git push alone does not establish a successful deployment.
