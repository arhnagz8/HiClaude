# Writer brief — Owner journey 0→100 (Persian) and START-HERE

Audience: the owner (Iranian entrepreneur, smart, not an engineer) and — equally — a **weak AI** that must be able to execute from the text alone. Language: Persian (formal-friendly), identifiers/commands/code in English. Every number carries source + date (or is marked UNVERIFIED with exact verification steps). No evasion advice (CLAUDE.md §3): where the owner's goal hits a regulatory cap or provider rule, write the lawful path + the risk.

## Files to produce
- `docs/00-START-HERE.md` — one-page entry: what this pack is; 10-minute orientation; how to run the demo (`npm run demo`) and open the simulation report; **top results** (from `reports/`: 3-year base run headline, scenario table); **what to verify first-hand** (ranked by money impact, from `docs/03-research/CALIBRATION.md`); map of all docs; decision checklist; where to ask AI for help (prompts to paste).
- `docs/01-owner-journey/00-overview.md` — the whole journey on one page (phases, durations, cost ranges, gates).
- `docs/01-owner-journey/NN-<phase>.md` for each phase below.
- `docs/01-owner-journey/checklists/*.md` — printable checklists (launch, daily, weekly, monthly, incident, month-end close).
- `docs/01-owner-journey/glossary.md` — Persian ↔ English terms (تتر، شناسه‌دار، پایا، ساتنا، شاپرک، اینماد، مودیان…).
- `docs/01-owner-journey/ai-prompts.md` — copy-paste prompts for a weak AI per phase ("given docs X, do Y, verify with Z").

## Phases (each file uses the template below)
0. Decisions (brand, entity, risk appetite, capital, product focus, supplier mix) — decision table with recommendation + trade-offs
1. Legal & tax setup (entity, tax ID, Enamad, bookkeeping, e-invoicing) — steps/cost/time
2. Accounts & suppliers (bank accounts, exchange accounts & KYC levels, card/voucher providers, wallets & key custody, SMS provider, gateway application)
3. Capital & float (how much, deposit cadence under caps/locks, treasury routine, reserves)
4. Pricing setup (policy defaults, formulas in words with worked examples, how/when to change margins, rush tiers, USDT-pay discount)
5. Tech go-live (hosting in/out of Iran, env vars, deploy, mock→live checklist adapter by adapter, domain/SSL, backups, monitoring)
6. Pilot (10–30 friendly orders, test matrix per payment method, success criteria, rollback)
7. Launch (channels, support readiness, SOPs, hiring, trust building)
8. Operations (daily/weekly/monthly routines with exact screens/commands)
9. Growth & scale (lawful capacity increases, diversification, new products)
10. Risk & incidents (runbooks: provider freeze, exchange outage, rate spike, fake receipts, regulatory change, internet shutdown)
11. Reporting & decisions (read statements/KPIs, triggers for action, tax calendar)

## Per-step template
`### Step N.M — <title>` · **هدف** · **چرا مهم است** · **دقیقاً چه کنم** (numbered actions with exact screen/command/link) · **هزینه** (range, currency, source/date) · **زمان** · **پیش‌نیاز** · **خروجی/معیار موفقیت** · **خطاهای رایج و راه‌حل** · **ریسک** · **چک‌لیست** · **اسناد مرتبط** (relative links).

## Quality bar
Cross-check against `docs/03-research/*`, `docs/04-decisions/ADR-*`, `docs/07-operations/*`, `docs/08-compliance-risk/*`, the actual app/admin screens (open the demo and verify labels/paths), and simulation reports for realistic expectations (volumes, margins, float, break-even). Link, don't duplicate. Mark anything unverified.
