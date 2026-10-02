# MISSION — long-horizon goal (set 2026-10-02, Mehr 1405)

## هدف (برای مالک)
تا صبح فردا: (۱) یک «بسته‌ی کانتکست» کامل که حتی یک هوش مصنوعی ضعیف هم بتواند همه‌چیز را از آن پیاده کند؛
(۲) یک پلتفرم واقعاً کارکرد (وب‌سایت + مینی‌اپ تلگرام/بله + ربات + پنل ادمین/اپراتور) با ارائه‌دهنده‌های mock؛
(۳) یک **شبیه‌ساز دنیای واقعی** که چند سال کسب‌وکار را با ایجنت‌ها (مشتری، اپراتور، رقیب، صرافی، بانک، رگولاتور، مالک)
از صفر تا سودآوری اجرا کرده و **صورت‌های مالی واقعی** (سود و زیان، ترازنامه، جریان نقدی) از دفتر کل دوطرفه‌ی خود برنامه می‌دهد؛
(۴) سناریوهای متعدد (جهش نرخ دلار/تتر، افت ارزش ریال، محدودیت بانک مرکزی، قطعی درگاه، قطعی اینترنت، جنگ قیمت…) و گزارش مقایسه.
کار متوقف نمی‌شود: اگر وقفه‌ای رخ داد، از `docs/STATUS.md` ادامه می‌دهیم.

## Goal (operational)
Deliver, autonomously and without stopping (up to ~10+ hours; resume from `docs/STATUS.md` after any interruption):

1. **Research pack** — exhaustive, sourced, perishable-aware; `data/*.json` validated against schema.
2. **Platform** — website, Mini App (Telegram + Bale), bot, admin/operator panel, dynamic pricing engine, double-entry ledger,
   order state machine, treasury/float planner, payment adapters (gateway / card-to-card / USDT on-chain), fulfilment (provider API
   or operator-assisted), notifications — all running on mock providers driven by a simulated world; live adapters fixture-tested.
3. **World simulator** — the real app code driven through a virtual clock for **years** of business, from zero: launch → first customers
   → growth → macro shocks → hiring → profitability, with financial statements generated from the real ledger.
4. **Persona agents** — LLM-driven personas (customer, operator, owner) that really use the UI/API in scenarios and write reports
   (income, friction, decisions); the owner persona performs periodic strategy checkpoints inside the long simulation.
5. **Debate & decisions** — specialists with different expertise challenge each other; outcomes recorded as ADRs in `docs/04-decisions/`.
6. **Weak-AI readiness** — prove the playbook: a small model must be able to implement a module from the docs and pass its tests.

## Definition of Done (check every box before stopping)
- [ ] `docs/03-research/*` for all 12 specialist areas, with sources, `as_of`, confidence; `data/*.json` pass `npm run validate:data`.
- [ ] Debate round done: critiques, ≥5 ADRs, all high-severity issues resolved or explicitly accepted.
- [ ] `npm install && npm test` green; `npm run typecheck` clean.
- [ ] `npm run demo` starts API + web + mock world; Persian RTL UI works for customer, Mini App mode (`/tg`, `/bale`) and `/admin`.
- [ ] Pricing is fully dynamic: changing the simulated USDT/IRT rate / provider fee / competitor price re-prices quotes automatically,
      with itemised breakdown, volatility buffer, price-lock TTL, rush tiers, rounding rules, VAT handling.
- [ ] Ledger invariants: debits=credits at all times; balance sheet balances; inventory lots give realised FX gain/loss.
- [ ] `npm run sim -- --scenario base --years 3 --seed 1` emits `reports/<run>/`: monthly income statement, balance sheet, cash flow,
      KPIs (orders, AOV, take-rate, CAC, LTV, retention cohorts, SLA, float utilisation, FX effect), charts (self-contained HTML), `summary.md`.
- [ ] ≥ 10 scenarios (incl. devaluation shock, rial recovery, CBI cap cut, gateway blackout, internet shutdown, provider freeze,
      sanctions event, price war, best case, worst case) + comparison report + sensitivity (tornado) tables.
- [ ] Persona E2E: Playwright runs for customer/operator/owner with screenshots + written reports.
- [ ] Owner journey 0→100 (fa), go-live checklist mock→live (fa), ops SOPs (fa), implementation playbook (en), ADRs.
- [ ] Weak-AI test executed and its findings folded back into the playbook.
- [ ] Everything committed and pushed to `claude/epic-einstein-mw1ohs`; `docs/STATUS.md` final; `docs/00-START-HERE.md` written.

## Phases
| # | Phase | Who | Output |
|---|---|---|---|
| 0 | Foundation | lead | constitution, mission, schema, scaffold, contracts, architecture v1 |
| 1 | Research (12 specialists, 2 workflows) | agents | `docs/03-research/*`, `data/*.json` |
| 2 | Build (parallel with 1) | lead + builder agents | contracts/core/app/api/web/sim/live |
| 3 | Debate & decisions | critics, advocates, judges | issue lists, ADRs, patched research |
| 4 | Calibrate & simulate | lead + agents | scenario suite, multi-year runs, statements |
| 5 | Persona E2E | persona agents | screenshots + reports |
| 6 | Synthesis | editors + weak-AI test | START-HERE, journey, playbook, SOPs |

## Agent roster
Research: card-providers · ir-exchanges-usdt-rails · ir-payments-collection · legal-tax-compliance-ir · sanctions-counterparty-risk ·
service-catalog-demand · competitor-benchmark-ir · macro-fx-scenarios · platform-tech-security · ops-growth · ux-product-fa · pricing-treasury-economics.
Debate: red-team · cfo-auditor · compliance-officer · customer-proxy · operator-proxy · owner-proxy · moderator · advocates/skeptics/judges.
Build: core · app · api · web-customer · web-admin · sim-world · sim-agents · sim-reports · live-adapters.
Personas: customer (several segments) · operator · owner. Test: weak-AI (small model).

## Resume protocol (if stopped for ANY reason)
1. Read `CLAUDE.md`, this file, then `docs/STATUS.md` (authoritative progress log + next actions).
2. `TaskList`; check running workflows/agents; `git status`; `git log --oneline -15`.
3. Continue the first unchecked item in STATUS "Next actions". Never restart finished phases.
4. Re-arm the heartbeat (`send_later`, ~30 min) until every Definition-of-Done box is checked.
5. Update STATUS.md and commit+push after every meaningful step.
