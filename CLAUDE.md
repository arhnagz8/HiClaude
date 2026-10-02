# HiClaude — Project Constitution (every agent: read this first)

## 1. What this repo is
A Persian-first (fa-IR, RTL) **white-label reseller platform** for an Iranian owner:
customers pay in **Toman** (gateway / card-to-card / USDT); the owner funds USDT-backed
virtual cards and digital services at wholesale; customers only ever see the owner's brand.
Delivered as: customer website + Telegram/Bale **Mini Apps** + bot + admin/operator panel.

On top of the product we build:
1. A **research context pack** (docs + `data/*.json`) so complete that a weak AI could implement everything from it.
2. A **world simulator**: realistic multi-year simulation (customers, operators, competitors, exchanges,
   providers, banks, regulators, macro/FX, inflation) that drives the *real application code* through a
   virtual clock and emits true financial statements from the real double-entry ledger.

Owner profile: Iranian entrepreneur who can convert Toman→USDT himself, wants dynamic pricing, operator
approval where automation is impossible, rush (paid express) options, and a branded experience.
Owner's language: Persian. Today = **2026-10-02 = 10 Mehr 1405** (Friday, Iranian weekend).

## 2. Language rules
- Docs for the owner → **Persian** (`fa`). Technical specs, prompts for AI implementers, code, identifiers → **English**.
- UI copy → Persian (RTL, Persian digits, Jalali dates, Toman with thousands separators) via `copy/fa.json`; never hard-code UI strings in components.

## 3. Guardrails (non-negotiable — they also protect the business)
1. We build a **transparent reseller**. We do NOT research, design, document, or write tooling for: evading KYC/AML,
   sanctions or provider terms/geo-restrictions; fake, borrowed or rented identities/bank cards; structuring or
   splitting payments to dodge regulatory caps; multi-account farming of referral/affiliate programs; hiding the
   customer's/operator's origin from a provider; chargeback abuse. If the owner's goal seems to need one of these,
   write the **lawful alternative + the risk** instead, and say so.
2. Every product/provider carries a `risk_label` (`low|medium|high`) and `restriction_note` (e.g. "provider does not
   support Iran — account may be suspended"). Customer terms must disclose third-party suspension risk and refund policy.
3. **Never invent numbers.** Unknown → `null` + `UNVERIFIED` + `verify_how`. Prices, fees and rules are perishable:
   always carry `as_of` and sources. Conflicting sources → record both, adjudicate explicitly, state confidence.
4. Compliance docs are analysis, **not legal/tax advice**; tell the owner to confirm with a licensed professional.
5. Simulations are models, not forecasts: every report lists its assumptions and includes sensitivity analysis.

## 4. Research protocol
- `WebSearch`/`WebFetch` are deferred tools: load with `ToolSearch` query `select:WebSearch,WebFetch`.
- `WebFetch` is blocked by the egress proxy for most domains (mpay.cards, telegram, bale, exchanges…). Try a domain
  once; on `EGRESS_BLOCKED` do not retry — use `WebSearch` (`mode:"standard"` first, `"extended"` for niche/recent/hard facts).
  Search in **Persian and English**. WebSearch returns summaries, so say "per search summary of <url>" unless you saw the page.
- Any number that drives money needs ≥2 independent sources or is marked `confidence: low`.
- Prefer: official page/docs → regulator notice → reputable media → exchange/vendor blogs → forums (lowest).
- Use Python (sandbox) for calculations; show formulas; keep scripts in `scripts/research/`.
- Write incrementally (partial results survive); finish with a structured summary.

## 5. Data record format (`data/*.json`)
Leaf facts are objects: `{"value": <number|string|bool|null>, "unit": "...", "as_of": "YYYY-MM-DD",
"confidence": "high|medium|low", "sources": [{"url": "...", "title": "..."}], "verify_how": "..."}`.
Schema: `data/_schema/record.schema.json`. These files are the single source of truth that the pricing engine
and simulator load; the admin panel can override them at runtime (values in DB win over files).

## 6. Repository layout & ownership
```
CLAUDE.md, docs/MISSION.md, docs/STATUS.md      constitution, goal, live status log
docs/01-owner-journey/ 03-research/ 04-decisions/ 05-architecture/ 06-implementation-playbook/
docs/07-operations/ 08-compliance-risk/ 09-simulation/
data/                  fees, limits, catalog, competitors, fx history, scenarios (validated JSON)
packages/contracts     shared types + zod schemas + provider interfaces + Clock/RNG
packages/core          pure domain logic: pricing, rates, ledger, order state machine, treasury, policies
packages/app           application services + SQLite repos + jobs  (createApp(deps))
packages/sim           world, mock providers, agents, scenarios, financial statements, reports
packages/live          real provider adapters (rates, chain, gateway, messenger, SMS) — fixture-tested
apps/api               Fastify HTTP/SSE layer over packages/app (+ Telegram/Bale webhooks, /sim control in demo mode)
apps/web               React SPA: customer site, Mini App (/tg, /bale), admin/operator panel (/admin)
reports/               simulation outputs (committed: final runs; tmp ignored)
```
**Only edit files in your assigned area.** If you need a change elsewhere, write it in your return value.

## 7. Engineering conventions
- TypeScript strict, ESM, Node 22, `npm` workspaces, `tsx` for running TS, `vitest`. Workspace packages export TS source.
- **Money**: integers only. Toman = integer `IRT`; USDT in integer micro-USDT; use `decimal.js` for intermediate math and round
  at the boundary with an explicit mode (customer prices round **up**, payouts round **down**). Never use floats for balances.
- **Determinism**: all time through `Clock`, all randomness through seeded `Rng`. No `Date.now()`/`Math.random()` in core/app/sim.
- **Adapters**: every external system sits behind an interface in `packages/contracts`; `mock` (world-driven) and `live` implementations.
- **Ledger**: double-entry, append-only; every state change that moves value posts balanced entries; assert `Σdebits=Σcredits`.
- Tests are required for pricing, ledger, state machine, and every adapter (fixtures for live ones). `npm test` must stay green.
- Concurrency hygiene for parallel agents: wrap installs as `flock /tmp/hiclaude-npm.lock npm install …`; never run root installs concurrently.
- No secrets in the repo; `.env.example` lists every variable with a comment on where to obtain it.

## 8. Git
Branch: `claude/epic-einstein-mw1ohs`. Commit often with clear messages; push with `git push -u origin <branch>`
(retry on network error with backoff). Do not create PRs. Do not put model names in commits, code or docs.
