export const meta = {
  name: 'research-specialists',
  description: 'Domain research specialists for the Iran FX/card reseller project, each followed by independent verification',
  phases: [
    { title: 'Research', detail: 'each specialist executes its brief and writes docs + data/*.json' },
    { title: 'Verify', detail: 'independent re-check of money-critical claims, validator, guardrail audit' },
  ],
}

const ROOT = '/home/user/HiClaude'
const keys = (args && Array.isArray(args.keys)) ? args.keys : []
const NOTE = (args && args.note) ? `\n\nIMPORTANT RUN NOTE FROM THE LEAD: ${args.note}\n` : ''
if (!keys.length) throw new Error('args.keys (array of specialist keys) is required')

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    files_written: { type: 'array', items: { type: 'string' } },
    tldr: { type: 'array', items: { type: 'string' } },
    key_numbers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: ['number', 'string', 'null'] },
          unit: { type: 'string' },
          as_of: { type: 'string' },
          confidence: { type: 'string' },
        },
        required: ['name', 'value'],
      },
    },
    conflicts: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    needs_from_other_specialists: { type: 'array', items: { type: 'string' } },
    validation_output: { type: 'string' },
  },
  required: ['files_written', 'tldr', 'key_numbers', 'open_questions'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    claims_checked: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          result: { type: 'string', enum: ['confirmed', 'corrected', 'downgraded', 'unverifiable'] },
          note: { type: 'string' },
        },
        required: ['claim', 'result'],
      },
    },
    files_modified: { type: 'array', items: { type: 'string' } },
    guardrail_issues: { type: 'array', items: { type: 'string' } },
    validator_output: { type: 'string' },
    remaining_gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['claims_checked', 'files_modified', 'validator_output'],
}

const researchPrompt = (key) => `You are the research specialist "${key}" on the HiClaude project (repo: ${ROOT}). Today is 2026-10-02 (10 Mehr 1405).

READ FIRST, in this order:
1. ${ROOT}/CLAUDE.md  (guardrails, research protocol, data record format - binding)
2. ${ROOT}/docs/MISSION.md
3. ${ROOT}/docs/03-research/_briefs/README.md  (common process + Markdown template)
4. ${ROOT}/docs/03-research/_briefs/${key}.md  (YOUR MANDATE - execute every checklist item)

Context: we are building a Persian-first white-label reseller (virtual cards / top-ups / digital services, paid in Toman, funded in USDT) for an Iranian owner, plus a multi-year world simulator. Your outputs are the single source of truth for the pricing engine, the simulator parameters and the owner's playbook, so completeness, exact numbers, dates and sources matter more than speed. A weak AI must be able to implement from your files.

LANGUAGE: write the research Markdown in English (best for AI implementers) with Persian key terms in parentheses, and begin it with a short Persian summary section (خلاصه، ۸ تا ۱۲ بولت) for the owner. Files whose mandate says Persian (SOPs, legal templates, UI copy) are written in Persian.

HOW TO WORK
- Load the research tools first: ToolSearch with query "select:WebSearch,WebFetch". WebFetch is blocked for most domains (EGRESS_BLOCKED): try a domain once, then rely on WebSearch (standard first, extended for niche/recent/contradictory facts). Search in Persian AND English. Do not retry blocked hosts.
- Run at least 40 distinct searches (more is better). Cross-check every number that drives money with >=2 independent sources, or mark confidence "low". Record conflicts and adjudicate them explicitly.
- Search output is a summary: cite it as per-search-summary unless you saw the page directly.
- Write the Markdown file early (after ~15 searches), then deepen and rewrite; write JSON as you go. Do calculations in Python (scripts/research/) and embed the results.
- Validate every JSON file you produce: node ${ROOT}/scripts/validate-data.mjs <file> - it must print OK.
- Guardrails (CLAUDE.md section 3): no evasion tooling or advice (KYC/AML, sanctions, provider geo-restrictions, borrowed or fake identities/cards, splitting payments to dodge caps, referral farming). Where the owner's goal needs it, document the lawful alternative and the risk.
- Only write the deliverables named in your mandate (plus scripts under scripts/research/). Do NOT git commit or push; the lead does that. Do not edit CLAUDE.md or other agents' files.
- You may take up to ~90 minutes. Stop when the mandate is fully satisfied.

FINISH by returning the structured summary (files_written, tldr, key_numbers, conflicts, open_questions, needs_from_other_specialists, validation_output).${NOTE}`

const verifyPrompt = (key, r) => `You are an independent VERIFIER for specialist "${key}" on the HiClaude project (${ROOT}). Another agent wrote the deliverables; your job is to find what is wrong, unsupported, stale, inconsistent or non-compliant, and fix it in place. Today is 2026-10-02.

The specialist reported these files: ${JSON.stringify((r && r.files_written) || [])}
Headline numbers it reported: ${JSON.stringify(((r && r.key_numbers) || []).slice(0, 25))}

Read ${ROOT}/CLAUDE.md first (guardrails + data format), then the mandate ${ROOT}/docs/03-research/_briefs/${key}.md and every deliverable.

DO
1. Completeness: tick every checklist item of the mandate against the deliverables; list gaps. Fill small gaps yourself (search); report big ones.
2. Re-verify at least 12 of the most money-critical claims (fees, caps, rates, limits, dates, legal rules, prices) with FRESH searches using different queries/languages than the author likely used (ToolSearch "select:WebSearch,WebFetch" first; WebFetch is mostly blocked). Mark each: confirmed / corrected / downgraded / unverifiable. Correct the files in place; downgrade confidence, or set value null + status UNVERIFIED + verify_how, where you cannot confirm.
3. Internal consistency: TL;DR vs tables vs JSON numbers; units (Rial vs Toman; USD vs USDT); dates; arithmetic (recompute in Python).
4. Run node ${ROOT}/scripts/validate-data.mjs on every JSON deliverable; fix until it prints OK.
5. Guardrail audit (CLAUDE.md section 3): remove or replace any content that helps evade KYC/AML, sanctions, geo-restrictions, use borrowed/fake identities or cards, split payments to dodge caps, or farm referrals. Replace with the lawful alternative + the risk.
6. Do not git commit/push. Do not touch other specialists' files.

Return the structured verdict.${NOTE}`

phase('Research')
log(`Launching ${keys.length} specialists: ${keys.join(', ')}`)

const results = await pipeline(
  keys,
  (key) => agent(researchPrompt(key), { label: `research:${key}`, phase: 'Research', schema: RESEARCH_SCHEMA }),
  (research, key) =>
    agent(verifyPrompt(key, research || {}), { label: `verify:${key}`, phase: 'Verify', schema: VERIFY_SCHEMA })
      .then((verify) => ({ key, research, verify })),
)

const done = results.filter(Boolean)
log(`Finished ${done.length}/${keys.length} specialists`)
return { results: done }
