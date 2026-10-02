# Brief 05 — sanctions-counterparty-risk

**Goal:** Establish the true risk picture and *lawful* mitigation controls for the USDT leg, providers, exchanges and custody; produce a risk register the simulator can consume.
**Deliverables:** `docs/03-research/05-sanctions-counterparty-risk.md`, `data/risk_register.json`, `data/sanctions_timeline.json`.

## Checklist
1. **Timeline and adjudication** of OFAC/Treasury actions touching Iran & crypto 2024-2026: Zedcex/Zedxion (Jan-2026), Central Bank of Iran wallets (Apr/Jul-2026), BitBank (Sep-2026),
   and the **2026-06-02 designation of Nobitex / Wallex / Bitpin / Ramzinex**. Sources conflict (Elliptic / Chainalysis / Scorechain / Crystal report designation; some Iranian outlets call it a rumour about two foreign firms).
   Look for primary-source cues (Treasury/OFAC recent-actions wording, press-release text quoted by reputable outlets), decide, state confidence. What exactly is designated, who is covered, secondary-sanctions exposure, wind-down/general licences.
2. **Tether freezes**: mechanics, frequency, triggers, totals (≈$550M Iran-linked in 2026?), impact on Iranian users, recovery paths; blockchain-analytics clustering that exposes exchange hot wallets;
   implications (taint risk, provider KYC triggers, deposit rejections) for moving USDT from IR exchanges to providers.
3. **Provider-side policy**: which providers/vendors explicitly ban Iran (quote ToS), geo-IP enforcement behaviour, account bans, fund-forfeiture clauses — as *risk facts* for labelling products.
4. **Counterparty risk of custodial card providers** (mpay-like): failure modes (exit, freeze, insolvency), signals to monitor, float limits, sweep/withdraw cadence, diversification, reserves — probabilities for the simulator with cited base rates (failure frequency of crypto-card startups).
5. **Exchange counterparty risk**: hacks, insolvency, gateway closure, withdrawal freezes — historical incidents with durations.
6. **Operational security**: key management, hot/cold separation, address whitelisting, address poisoning, SIM-swap/Telegram takeover, insider risk.
7. **Lawful mitigations**: screening against the OFAC SDN digital-currency address list, transaction monitoring, float caps, kill switches, incident response, record-keeping, customer-facing risk disclosure, legal counsel.
8. **Risk register**: ≥40 risks — id, description, category, likelihood (1-5), impact (1-5), triggers, KRI, controls, residual risk, and simulator parameters `{probability_per_month, impact: {type, params}}`.

Guardrail: no methods to evade sanctions, screening or geo-blocks — exposure and compliant mitigation only.

## JSON
`data/risk_register.json`: `{ "risks": [ { "id","title","category","likelihood": <Record>, "impact": <Record>, "triggers":[], "kri":[], "controls":[], "residual": <Record>, "sim": { "probability_per_month": <Record>, "impact": {"type":"float_freeze_pct|downtime_hours|fine_irt|demand_multiplier|fee_change", "params": {...}} } } ] }`.
`data/sanctions_timeline.json`: dated events with `status: verified|reported|conflicting`, sources, adjudication note.
