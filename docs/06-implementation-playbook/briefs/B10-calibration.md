# Brief B10 — calibration bridge (research data → runtime config)

You turn research outputs (`data/*.json` with provenance Records) into the plain-value runtime config consumed by the platform and the simulator, without losing provenance.
Read first: `/home/user/HiClaude/CLAUDE.md`, `packages/contracts/src/{params,defaults,domain}.ts`, `docs/05-architecture/architecture.md` §17, `docs/05-architecture/sim-spec.md`, every `docs/03-research/*.md` and `data/*.json` that exists (incl. `data/config/{pricing,treasury,regulatory}.json` from specialist 12), `packages/app/README.md` (loader), `packages/sim/README.md` (what the sim reads).
You OWN `data/config/**`, `data/sim/**` (only calibration edits; B5 owns the structure), `data/scenarios/*.json` (merge research scenarios with the sim's built-ins), `data/catalog.json` (derived plain catalog), `scripts/calibrate.mjs`, `scripts/calibrate.test.ts`, `docs/03-research/CALIBRATION.md`.

## Deliverables
1. `scripts/calibrate.mjs` — deterministic, re-runnable: reads research Records (unwrap `.value`; when several sources conflict choose by documented rule: higher confidence → more recent `as_of` → conservative for costs/limits), writes:
   - `data/config/{brand,pricing,paymentMethods,latePayment,exchanges,providers,regulatory,tax,risk,treasury,fulfilment,operations}.json` — each **validates against the zod schemas** in `packages/contracts/src/params.ts` (the script runs `PlatformParamsSchema` on the merged result and fails loudly with paths);
   - `data/config/_provenance.json` — map `dotted.param.path → {source: "data/exchanges.json#exchanges[2].fees...", as_of, confidence, status}`; parameters that still use contract defaults are listed under `unverified` with `verify_how`;
   - `data/catalog.json` — plain product list (≥ 40 products from research 06 mapped to the `Product` type, with riskLabel/restrictionNoteFa, provider mapping to configured provider ids, SLA minutes, amount specs, inputs), validated;
   - sim inputs: `data/sim/segments.json`, `marketing.json`, `staff.json` (from research 10), competitor definitions `data/competitors.sim.json` (from 07), macro calibration `data/macro.sim.json` (from 08), calendar `data/calendar_ir.json` check, scenario files merged into `data/scenarios/<id>.json` (all 15 ids present and valid for `packages/sim` schema).
2. **Change report** `docs/03-research/CALIBRATION.md`: table of every parameter changed vs `defaultPlatformParams()` with old → new, source, confidence; list of still-UNVERIFIED parameters ranked by money impact (what the owner must verify first-hand and exactly how).
3. A test `scripts/calibrate.test.ts` (vitest) asserting: outputs validate; no `null`/NaN; units sane (bps vs pct, Toman vs Rial, USDT micro); catalog products reference existing providers; scenario files load via `packages/sim` `loadScenario`; app `SettingsService.getParams()` loads the config dir successfully.
4. Run `npm run validate:data`, `npx vitest run scripts`, and a **smoke simulation** (`npm run sim -- --scenario base --seed 1 --years 0.1`) after calibration; report any failures and fix the calibration (not the engine) or report engine bugs precisely.

Guardrails: never invent numbers; defaults stay defaults and are flagged. Return: files, parameter changes count, top unverified items, smoke-run results.
