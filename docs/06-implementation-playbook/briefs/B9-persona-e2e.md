# Brief B9 — Persona E2E (LLM personas drive the real UI)

Goal: prove the product works as a real business **through the real UI**, with agents behaving like real people, and capture honest reports (what they did, income/outcome, friction, defects). Runs against `npm run demo` (API in demo mode + built web + simulated world). Personas are LLM agents (Agent tool / workflow agents) using **Playwright with the system Chromium** (`executablePath: '/opt/pw-browsers/chromium'`; never run `playwright install`).

## Harness (you build once) — `e2e/`
- `e2e/playwright.config.ts` (Chromium only, `executablePath`, mobile + desktop projects, trace/screenshot on failure, baseURL from `DEMO_URL`, `workers: 1` for stateful runs).
- `e2e/support/world.ts` — helper client for `/api/v1/sim/*` (advance time, set speed, trigger scenario/event, read state), `withFreshDemo()` that boots `npm run demo` on a free port with a seed and tears it down.
- `e2e/support/persona.ts` — small helper library for agents: `login(phone)`, `screenshot(name)`, `waitForOrderStatus(...)`, `readToast()`, `capturePrice()`, `note(text)` (appends to the persona's journal), `finish(report)`.
- Deterministic scripted specs (`e2e/specs/*.spec.ts`) for the critical journeys (must pass in CI-like runs): customer buys card via each payment method; price changes with rate shock and re-quote UX; expired quote; underpay; operator fulfils; reveal-once; refund; admin changes margin and sees quote change; kill switch blocks; Mini App host (simulated Telegram & Bale) login and purchase.

## Persona runs (LLM-driven; reports in `reports/personas/<run>/`)
Each persona gets: identity & goal, budget, patience, tech skill, a short brief, and **only the UI** (no source code). They must act like a real user: read prices, hesitate, compare, abandon on friction, ask support, complain. They write `journal.md` (timestamped), `report.md` (outcome, satisfaction 1–10, price paid vs expectation, friction list, bugs with repro steps, suggestions) and screenshots.
- **Customers (≥ 6):** student buying a $25 card for coursework (price-sensitive, c2c); freelance developer topping up cloud credit (needs speed → rush); designer buying a subscription-payment (reads risk note, hesitates); gamer buying a gift card at night during a rate spike; small-business ads manager, large top-up via bank transfer/USDT-direct; first-time user on **Telegram Mini App**; skeptical user who tries support & refund; a **fraud-minded tester** (probes limits, wrong amounts, duplicate receipts — verifies the platform's defences).
- **Operator persona:** works a shift: claims tasks by priority, follows instructions, handles a failing provider, misses an SLA, uses the payment-match screen, escalates.
- **Owner persona (the owner's representative):** day 0→N: reviews dashboard, sets margins, funds float (treasury), reacts to a devaluation event (reprice/buffers), checks statements, decides on hiring, reviews tickets, and finally writes an **approval report**: does the business meet the owner's requirements (see `docs/MISSION.md`)? what would surprise a real owner? what is missing?
- Scenario drive: use `/sim/*` to run ~14 simulated days with at least one macro shock (devaluation +20 %), one regulatory event (night halt + buy cap), one outage; personas must notice and react via UI.

## Aggregation
`reports/personas/<run>/SUMMARY.md` (Persian + English): table of personas × outcome, total simulated income/profit from the admin statements screen, top 20 defects (severity-ranked, with screenshots), UX friction themes, owner approval verdict, recommended fixes. Then a **fix loop**: file defects → fix-agent patches (in the owning package) → re-run the failing journeys.

## Acceptance
Scripted specs pass; ≥ 8 persona reports + summary produced; every Sev-1/Sev-2 defect fixed or explicitly accepted with rationale in `docs/04-decisions/`; screenshots reviewed (agents must actually look at them).
