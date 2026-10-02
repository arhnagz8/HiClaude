# Builder brief B4 — `packages/sim` world (macro + counterparties)

Read first: `/home/user/HiClaude/CLAUDE.md`, `docs/05-architecture/sim-spec.md` (normative), `architecture.md` (§4, §8), `packages/contracts/src/*` (ports, params, calendar, rng).
You OWN `packages/sim/src/{core,macro,exchange,bank,gateway,chain,provider,messaging,competitors,events,scenario,world}/**` and their tests. Do NOT import `@hiclaude/app` or `@hiclaude/core` (they are being built in parallel). Another agent (B5) adds demand/agents/owner/accountant/runner later — design your components so they can plug in.
No git commit/push. Installs: `flock /tmp/hiclaude-npm.lock npm install <pkg> -w @hiclaude/sim`. Runtime deps: `zod`, `@hiclaude/contracts` only.
`npx tsc --noEmit -p packages/sim` and `npx vitest run packages/sim` must pass.

## Principles
Deterministic (seeded `Rng.fork`, virtual clock, stable iteration order), **no wall-clock**. Every component implements the contract **ports** (or exposes a documented API for agents), is parameterised by `PlatformParams` / scenario overrides, and supports `applyEvent(type, params)` for scenario events. Components never touch each other directly except through documented interfaces (`World` wires them).
Realism over elegance: the goal is faithful Iranian-market mechanics (caps, locks, halts, Paya cycles, outages) so that the app's treasury/pricing/risk code is truly exercised.

## Deliverables

### core/
- `SimClock extends ManualClock`; `EventQueue<T>` (binary heap ordered by `(time, priority, seq)`), `Simulation` loop helpers (`runUntil(t)`), `Hooks` for per-step callbacks, `StatsCollector` (counters/histograms/time series with ring buffers).

### macro/ — `MacroEngine`
Regime-switching jump-diffusion for USDT/IRT (regimes `calm|stress|crisis|recovery`), per-regime daily vol/drift/jump params, daily Markov transitions, intraday stepping (minute resolution available lazily via `midAt(t)` interpolation that is **consistent** regardless of query order), weekday & night-gap effects, **overlays** from scenarios (`shock`, `trend`, `recovery`, `volatility_spike`), cash-dollar premium, `inflationIndex(t)` (Toman CPI, annual rate param), `demandMultiplier(t)`, `rialStrength(t)`. Calibration loader `loadMacroCalibration(path?)` that tolerates research Record wrappers (`{value,...}` → unwrap) from `data/macro_calibration.json`; otherwise built-in defaults: spot 257,000 Toman/USDT at 2026-10-02, calm daily vol ≈ 1.0 %, stress 2.2 %, crisis 4.5 %, annual drift ≈ +45 % in calm/stress regimes (≈ +0.12 %/day), jump rate 4/yr with mean +4 %/sd 3 % (these defaults are placeholders; research 08 will replace them). Tests: determinism, positivity, query-order independence, calibrated moments within tolerance, overlay effects.

### exchange/ — `ExchangeSim implements ExchangeAccountPort`
Per params (`ExchangeParams`) + regulatory: ticker = mid·(1+premium)·(1±halfSpread) + noise; **trading hours / night halt** (IRST window), per-user daily buy cap, per-ID IRT deposit cap per rolling 24 h (× identities), **withdrawal lock hours per lot** (LOCKED error; `usdtWithdrawable` accounting), min order, taker fees, withdraw fees/min per network, withdraw delays (broadcast then complete via `ChainSim`), IRT deposit methods with settlement delays (gateway instant, Paya next cycle, c2c instant) debiting `BankSim`, IRT withdrawal, outages (random per `outageProbPerMonth` + scenario injection), freeze events, slippage for large orders. `balances()` consistent with lots. Tests: every constraint + property tests (conservation of IRT/USDT, lock expiry, cap rollover).

### bank/ — `BankSim implements BankPort`
Our account: balance, credits list (c2c with delays/jitter, Paya/Satna, gateway settlements), `injectCustomerTransfer({amountIrt, senderCardMasked, at, destinationCardId, note})` for agents, `transferOut` with Paya/Satna cycle times (skips Thu-pm/Fri/holidays), per-card daily caps for c2c, statement duplicates/late posting noise (configurable), fee schedule.

### gateway/ — `GatewaySim implements PaymentGatewayPort`
`create/verify` with pay-page state machine controlled by agents (`simulateCustomerPayment(authority, outcome)`), fees (feePct/cap/fixed), downtime windows, settlement scheduling into `BankSim` (T+n business days), failure modes (verify timeouts, mismatched amounts), `blackout(days)` event.

### chain/ — `ChainSim implements ChainPort`
Networks TRC20/BEP20/TON (+ others) with block time, confirmations, fees (TRC20 energy model simplified: burn/fee), address allocation per order (deterministic from Rng), transfers (customer→our address via `injectIncoming`, exchange→wallet, wallet→provider), `listIncoming`, `txStatus`, `screenAddress` (taint probability param; deterministic per address hash), anomaly injectors (wrong network, wrong token, underpay, overpay, duplicate), wallet balances.

### provider/ — `ProviderSim implements ProviderPort` + `ProviderPanel`
From `ProviderParams`: deposit detection → credit after confirmations + `creditDelayMinutes`; balance; `issueCard/topUpCard/payVendor` with latency distribution, fee model (issue, topup bps+fixed, fx), per-merchant decline probability by product `riskLabel` and provider quality, random failures, min load/limits, **freeze events / counterparty failure** (`counterpartyFailurePerMonth`, recovered fraction), card store with fake PAN generation (Luhn-valid test BINs, clearly fake), `capabilities` honoured (panel-only providers reject API calls with `REJECTED` unless called through `ProviderPanel`, the operator-side facade with human-latency hooks). Tests: fees, limits, declines distribution, freeze, determinism.

### messaging/
`MessengerSim` (records outbound messages; `verifyInitData` accepting a documented fake format `sim:<userId>:<authDate>`), `SmsSim` (costs, delivery delay, failure rate), `IdentitySim` (shahkar match probability, cost, card-owner lookups).

### competitors/ — `CompetitorSim` + `CompetitorPricePort`
K competitors (config from scenario/`data/competitors.json` if present; defaults: 6 with strategies follow/undercut/premium/erratic), per product family price = `theirCost(t−lag)·(1+markup)`+noise with repricing cadence, promos, trust & SLA attributes, entry/exit hazards, price-war overlays; exposes `quotes()` for the app and `priceIndex(family,t)` for the sim.

### events/ — `EventScheduler`
Registry mapping scenario events (`cbi_deposit_cap`, `night_halt`, `gateway_blackout`, `internet_shutdown`, `provider_freeze`, `sanctions_freeze`, `exchange_hack`, `price_war`, `devaluation_shock`, `volatility_spike`, `demand_shock`, `telegram_filter`…) to component `applyEvent` calls, with start/end days and automatic reversal. Emits an event log.

### scenario/
`schema.ts` (zod) per `sim-spec.md` §3; `loadScenario(idOrPath)` (reads `data/scenarios/<id>.json` if present, tolerant of Record wrappers; else **built-in definitions in code for all 15 required scenario ids** in `builtin.ts`), `listScenarios()`, deep-merge overrides, sanity validation.

### world.ts
`createWorld({ scenario, seed, params?: PlatformParams, clock? }): World` constructing all components with forked RNG streams and wiring: `world.ports(): AppPorts` (exchanges by id, gateways, bank, chain, providers, messengers, sms, identity, competitors), `world.advanceTo(t)` (processes queued events/timers up to t in order), `world.nextEventTime()`, `world.stats`, `world.applyEvent(...)`, `world.snapshotState()` for the demo UI (`SimStateDto` in contracts/api.ts).

## Tests (≥ 100) and acceptance
Component tests as listed + a **world smoke test**: create world for scenario `base`, run 90 simulated days with synthetic calls (buy USDT, withdraw after lock, send to provider, issue cards), assert conservation laws (USDT & IRT), determinism (same seed ⇒ same hash of event log; different seed ⇒ different), and no wall-clock use (`grep -R "Date.now\|Math.random" packages/sim/src` returns nothing outside tests).
README at `packages/sim/README.md` (world part): component list, port mapping, event types, scenario schema, how B5 plugs in.

## Return
Files, component APIs (esp. the agent-facing ones: `bank.injectCustomerTransfer`, `gateway.simulateCustomerPayment`, `chain.injectIncoming`, `ProviderPanel`), event type list, assumptions, defaults used pending research calibration.
