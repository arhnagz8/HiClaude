# Research briefs — how every specialist works

Each file in this folder is the **mandate** of one specialist. A specialist agent receives only its key
(e.g. `01-card-providers`) and must read its brief, then deliver exactly what the brief asks. Briefs are re-runnable:
facts are perishable (fees, caps, prices, regulations) — re-run a brief monthly to refresh `data/*.json`.

## Common process (all specialists)
1. Read `/home/user/HiClaude/CLAUDE.md` (constitution: guardrails, research protocol, data record format) and `docs/MISSION.md`.
2. `ToolSearch` with `select:WebSearch,WebFetch`. WebFetch is mostly blocked — try each domain once.
3. Plan 40+ queries (Persian + English; standard mode first, `extended` for hard/recent facts). Cross-check anything that drives money.
4. Write the Markdown draft after ~15 searches, then refine; write JSON as you go.
5. Calculations in Python (`scripts/research/<key>_*.py`); embed results and formulas in the doc.
6. Validate JSON: `node scripts/validate-data.mjs data/<file>.json` (must print `OK`). Fix every error.
7. Return the structured summary requested by the runner (files, headline findings, key numbers, conflicts, open questions, needs).

## Markdown deliverable template
```
---
title: ...
owner_agent: <key>
as_of: 2026-10-02
confidence: high|medium|low
status: draft|final
---
# Title
## TL;DR  (≤12 bullets, numbers with units and dates)
## Facts table  (id | fact | value | unit | as_of | confidence | source ids)
## Details  (sections per checklist item)
## Implications  (for product, pricing engine, simulator parameters, owner decisions)
## Conflicts & adjudication
## Open questions  (each with verify_how)
## Sources  ([S1] url — title — what it supports — seen directly or "per search summary")
```
Target 4,000–9,000 words; tables over prose; every number has unit + date + source id.

## Non-negotiables
- Never invent numbers. Unknown → `null`, `status: "UNVERIFIED"`, plus `verify_how`.
- No evasion tooling (KYC/AML, sanctions, geo-restrictions, borrowed identities/cards, structuring around caps, referral farming).
  If the owner's goal seems to need it, write the lawful alternative and the risk instead.
- Stay in your lane; list cross-specialist needs in `needs_from_other_specialists`.
