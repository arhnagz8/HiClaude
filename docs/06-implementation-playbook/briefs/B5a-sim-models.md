# Builder brief B5a — sim models (no app dependency): demand, marketing, reputation, owner policy, KPIs, reports, comparison tooling

This is the **first half** of `B5-sim-engine.md` (read that brief fully for context and the normative requirements; read `docs/05-architecture/sim-spec.md`, `packages/contracts/src/*`). You build everything in B5 that does **not** require the application engine, so you can start now while `packages/core`, `packages/app` and the sim world (B4) are still being built.
You OWN: `packages/sim/src/{demand,marketing,reputation,owner,kpi,reports,tooling}/**`, `packages/sim/src/models.ts` (barrel for your modules — do NOT edit `packages/sim/src/index.ts`, B4/B5b own it), `data/sim/*.json`, and your tests. Do NOT import `@hiclaude/app` or `@hiclaude/core`; B4 is concurrently creating other `packages/sim/src/*` directories — never touch them.
No git commit/push. Installs: `flock /tmp/hiclaude-npm.lock npm install <pkg> -w @hiclaude/sim` (only zod/@hiclaude/contracts needed). `npx tsc --noEmit -p packages/sim` and `npx vitest run packages/sim/src/{demand,marketing,reputation,owner,kpi,reports,tooling}` must pass (other dirs may be mid-flight; run only yours if the package-wide typecheck is red because of others — note it).

## Define the seams B5b will use (document in `packages/sim/README.md` section "Models")
```ts
interface MarketSignals {                 // provided by the runner from the world
  now: EpochMs
  macroDemandMultiplier: number           // from MacroEngine
  competitorPriceIndex(family: string): number   // competitor price / reference price (1 = parity)
  competitorTrust(family: string): number
  ourQuote(req: {family:string; amountUsdCents:number; rushTier:string}): { priceIrt:number; slaMinutes:number } | null
  ourTrust: number
}
interface RunResultLike { statements: Statements[]; kpis: KpiRow[]; ... }   // shape you define in reports/types.ts for the report generator & tooling
```
Everything you build consumes/produces these plain data shapes so it can be unit-tested with synthetic inputs.

## Deliverables (see B5 for full requirements)
1. **demand/** — segment definitions (≥ 8 + fraudster) loaded from `data/ops_growth.json` (tolerate absence/Record wrappers) with built-in documented defaults in `data/sim/segments.json`; `ArrivalProcess` (15-minute Poisson buckets, diurnal profile, weekday/month seasonality incl. Nowruz/exam seasons, macro/marketing/reputation multipliers); `SellerChoice` (multinomial logit over {us, competitors, outside option}); `BasketSampler` (family/SKU/amount/rush/payment method); `RetentionModel` (repeat purchase, churn, referral generation); `CustomerPlan` (pure description of what a customer intends to do: sequence of intents + mistake flags — the executor lives in B5b). Statistical tests (arrival counts, choice shares vs analytic logit, retention curves).
2. **marketing/** & **reputation/** — channels with saturating spend→signup curves and CAC dynamics (`data/sim/marketing.json`); trust score dynamics with decay; both pure state machines with `step(dt, inputs)`.
3. **owner/** — `OwnerPolicy` rule engine (`conservative|baseline|aggressive`; `data/sim/owner_policies.json`) mapping a `OwnerObservation` (KPIs, cash, runway, float coverage, queue age, utilisation, CAC/LTV, fraud rate, FX result, alerts) to `OwnerDecision[]`; `OwnerDecisionSchema` (zod) + `applyDecisionsFile(date)` scheduling helper; `buildDigest(observation, lastDecisions)` → `digest.json` shape; decision log writer. Property tests (policy never produces invalid decisions; margin moves bounded; hiring/firing hysteresis).
4. **kpi/** — KPI definitions and calculators over order/ledger summaries (take-rate, CAC, LTV by cohort, retention cohorts, SLA attainment, float utilisation, FX effect…) as pure functions over simple input records.
5. **reports/** — report generator over `RunResultLike`: `report.html` (self-contained, inline SVG charts, RTL Persian with English fallbacks, print CSS), `summary.md` (Persian + English), chart library (line/area/bar/stacked/heatmap/tornado) shared with nobody else; golden-file/snapshot tests with synthetic data; visual QA with system Chromium screenshots (look at them!).
6. **tooling/** — `compare` (multi-run table + HTML deltas), `sensitivity` (one-at-a-time sweeps → tornado data + chart), `suite` index page generator; all parameterised by a `runSimulation(opts) => Promise<RunResultLike>` function type so B5b can plug the real runner in; tested with a stub runner.
7. **data/sim/** — `segments.json`, `marketing.json`, `staff.json`, `owner_policies.json` with documented defaults (plain values; each carries a `source` string).

## Acceptance
≥ 100 tests, typecheck clean for your files, README "Models" section with the seams, parameter tables and how to add a segment/policy/decision type. Return: files, seam interfaces (exact TS), parameter sources, assumptions, open issues.
