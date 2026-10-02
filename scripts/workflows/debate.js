export const meta = {
  name: 'debate',
  description: 'Multi-perspective critique of plan/research/architecture, adversarial resolution (advocate vs skeptic vs judge) and patching with ADRs',
  phases: [
    { title: 'Critique', detail: 'specialist critics file structured issues' },
    { title: 'Cluster', detail: 'moderator dedups and ranks issues into clusters' },
    { title: 'Resolve', detail: 'advocate vs skeptic, judge decides' },
    { title: 'Patch', detail: 'patchers apply decisions and write ADRs' },
  ],
}

// Usage (Workflow tool, scriptPath = this file):
//   args = { stage: 'critique', critics: ['red-team','cfo-auditor'] }
//   args = { stage: 'cluster' }
//   args = { stage: 'resolve', clusterIds: ['C01','C02'] }
//   args = { stage: 'patch', areas: ['architecture','research','compliance','ops','ux','sim','catalog','other'] }
// Everything is exchanged through files under docs/04-decisions/_work/ so stages are resumable and can be run in several workflows in parallel.

const ROOT = '/home/user/HiClaude'
const WORK = `${ROOT}/docs/04-decisions/_work`
const stage = args && args.stage

const CRITICS = {
  'red-team': 'Adversarial strategist. Find every way this business gets shut down, robbed, sued, banned, out-competed, or goes bankrupt within 12 months. Think like a regulator, a bank compliance officer, a scammer, a rival, a hacker, an angry customer, and a card provider that freezes funds. Stress the weakest assumptions.',
  'cfo-auditor': 'Forensic CFO. Audit every number: units (Rial vs Toman, USD vs USDT, bps vs %), unit economics, float/working capital, FX exposure, tax, break-even, ledger design, price formulas. Recompute independently in Python. Find errors, double counting, missing costs and wrong assumptions.',
  'compliance-officer': 'Iranian legal/tax/AML and international sanctions compliance officer. Check legality, licensing, tax, consumer law, sanctions exposure, disclosures. Verify the guardrails of CLAUDE.md section 3 are honoured EVERYWHERE (docs, data, code, copy, briefs, scenarios). Flag anything that facilitates evasion of KYC/AML, sanctions, geo-restrictions, borrowed identities/cards, structuring around caps, or referral farming, and propose the lawful alternative.',
  'customer-proxy': 'A panel of Iranian customers (student, freelancer, small-business owner, parent). Judge trust, clarity, price transparency, payment friction, support, speed, language and UX. What would make you abandon, complain, or recommend?',
  'operator-proxy': 'A support/operations employee. Judge SOPs, task instructions, error handling, fraud checks, workload, tooling, escalation, shift design. What breaks on a bad day (provider down, rate spike, fake receipt, angry customer)?',
  'owner-proxy': 'The owner representative: an Iranian entrepreneur who can convert Toman to USDT, wants a fast launch, dynamic pricing, automation and a business that survives. Judge whether the context pack lets the owner (or a weak AI) act with zero missing information; list every question the owner would ask that the pack does not answer.',
  'tech-architect': 'Principal engineer. Review architecture, contracts and code for correctness, security, scalability, testability, determinism and doc/code mismatches. Read the actual code under packages/ and apps/ when present.',
  'growth-strategist': 'Growth strategist for Iranian online markets. Judge go-to-market, CAC/LTV assumptions, channel plan, pricing strategy, competitive response, retention and the realism of simulated demand.',
}

const ISSUES_SCHEMA = {
  type: 'object',
  properties: {
    critic: { type: 'string' },
    file: { type: 'string' },
    counts: { type: 'object', properties: { blocker: { type: 'number' }, high: { type: 'number' }, medium: { type: 'number' }, low: { type: 'number' } } },
    top: { type: 'array', items: { type: 'string' } },
  },
  required: ['critic', 'file', 'counts', 'top'],
}

const CLUSTER_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' }, area: { type: 'string' } },
        required: ['id', 'title', 'severity', 'area'],
      },
    },
  },
  required: ['file', 'clusters'],
}

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    clusterId: { type: 'string' },
    decision: { type: 'string', enum: ['accept_current', 'modify', 'reject_current', 'owner_decision_needed'] },
    summary: { type: 'string' },
    adrFile: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: { type: 'string' }, file: { type: 'string' }, change: { type: 'string' } },
        required: ['area', 'file', 'change'],
      },
    },
    residualRisk: { type: 'string' },
  },
  required: ['clusterId', 'decision', 'summary', 'actions'],
}

const PATCH_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    adrsWritten: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['area', 'filesChanged'],
}

const COMMON_READ = `Read first: ${ROOT}/CLAUDE.md (binding), ${ROOT}/docs/MISSION.md, ${ROOT}/docs/STATUS.md. Then read, as far as they exist: ${ROOT}/docs/business-plan-full-context.md, every ${ROOT}/docs/03-research/*.md (skim tables/TL;DR first, deep-read what you critique), ${ROOT}/data/*.json and data/config/*.json (Record format: value + as_of + confidence + sources), ${ROOT}/docs/05-architecture/*.md, ${ROOT}/docs/06-implementation-playbook/**, ${ROOT}/docs/07-operations/*, ${ROOT}/docs/08-compliance-risk/**, and the code under ${ROOT}/packages and ${ROOT}/apps. ToolSearch "select:WebSearch,WebFetch" if you need to verify a fact (WebFetch is mostly blocked; use WebSearch).`

const critiquePrompt = (key) => `You are the critic "${key}" in a structured debate about the HiClaude project (a Persian-first white-label reseller of USDT-funded virtual cards, top-ups and digital services for an Iranian owner, plus a multi-year world simulator). Today is 2026-10-02.

YOUR LENS: ${CRITICS[key]}

${COMMON_READ}

TASK: find real problems from your lens. Be specific and evidence-based (cite file paths and sections / numbers; recompute where you can). No generic advice, no flattery. Prefer fewer, sharper issues over noise, but aim for at least 12 issues (more if warranted).
Write ${WORK}/issues-${key}.json as a JSON array of objects:
{ "id": "${key}-01", "title": "...", "severity": "blocker|high|medium|low", "area": "architecture|research|compliance|ops|ux|sim|catalog|pricing|code|other", "evidence": ["path#section or quote"], "why_it_matters": "...", "proposed_fix": "...", "affected_files": ["..."], "owner_decision_needed": false }
Severity: blocker = would stop launch / cause legal or money-losing failure; high = likely material loss or major rework; medium = notable weakness; low = polish.
Guardrail for YOUR proposals: never propose evasion of KYC/AML, sanctions, provider geo-restrictions, fake/borrowed identities or cards, structuring around caps, or referral farming — propose lawful alternatives and disclosures.
Return the structured summary (counts per severity, top 5 issue titles).`

const clusterPrompt = () => `You are the debate moderator for HiClaude. Today is 2026-10-02. Read ${ROOT}/CLAUDE.md, then every ${WORK}/issues-*.json.
1. Merge duplicates and near-duplicates into clusters; keep every source issue id in the cluster.
2. Rank by severity and by cross-critic agreement (issues raised by several critics rank higher). Drop pure nits (low severity with no cluster-mates) but list them in a "nits" array.
3. For each cluster define: id "C01".., title, severity, area, issueIds[], the core question to resolve, affected_files[], and whether an owner decision is genuinely needed (money/risk appetite) vs a technical/doc fix.
4. Write ${WORK}/clusters.json = { "clusters": [...], "nits": [...] } (cap at 24 clusters; merge the rest into broader ones).
Return the structured list of clusters (id, title, severity, area).`

const sidePrompt = (side, clusterId) => `You are the ${side.toUpperCase()} in a structured debate about cluster ${clusterId} of the HiClaude project. Today is 2026-10-02.
Read ${ROOT}/CLAUDE.md, then the cluster ${clusterId} in ${WORK}/clusters.json and its source issues in ${WORK}/issues-*.json, then the affected files and any docs/data needed.
${side === 'advocate'
  ? 'ADVOCATE: defend the CURRENT design/plan where it is sound, with evidence (files, numbers, sources; recompute where relevant). Concede what is genuinely wrong. Propose the smallest mitigations that retire the risk.'
  : 'SKEPTIC: attack the current design/plan on this cluster. Show concrete failure scenarios with numbers. Propose the strongest credible alternative and what it costs. Verify disputed facts with searches (ToolSearch "select:WebSearch,WebFetch"; WebFetch is mostly blocked).'}
Guardrail: no evasion of KYC/AML, sanctions, geo-restrictions, borrowed/fake identities or cards, structuring around caps, referral farming — lawful alternatives only.
Write your case to ${WORK}/case-${clusterId}-${side}.md (max ~700 words, bullet-heavy, with evidence refs) and return a 3-sentence summary string.`

const judgePrompt = (clusterId) => `You are the JUDGE for cluster ${clusterId} of the HiClaude project. Today is 2026-10-02.
Read ${ROOT}/CLAUDE.md, the cluster in ${WORK}/clusters.json, both cases ${WORK}/case-${clusterId}-advocate.md and ${WORK}/case-${clusterId}-skeptic.md, the source issues, and verify any pivotal fact yourself (files, recomputation, WebSearch via ToolSearch "select:WebSearch,WebFetch").
Decide: accept_current | modify | reject_current | owner_decision_needed (only when it is truly the owner's risk-appetite/money call; then state the options with numbers and your recommendation).
Write the Architecture Decision Record ${ROOT}/docs/04-decisions/ADR-${clusterId}-<slug>.md with sections: Title, Status, Context, Options considered, Decision, Consequences, Actions (checklist: file → change), Residual risk, Sources. Keep it under 600 words.
Write ${WORK}/decision-${clusterId}.json = { clusterId, decision, summary, adrFile, actions: [{ area: architecture|research|compliance|ops|ux|sim|catalog|pricing|code|other, file, change }], residualRisk }.
Return the same object as structured output. Actions must be concrete and executable by a patcher agent (exact file, what to change, new values with units and sources).`

const patchPrompt = (area) => `You are the PATCHER for area "${area}" on the HiClaude project. Today is 2026-10-02.
Read ${ROOT}/CLAUDE.md, then every ${WORK}/decision-*.json. Take ONLY the actions whose area is "${area}" and apply them precisely: edit the named docs/data/briefs/params, keep JSON valid (run node ${ROOT}/scripts/validate-data.mjs on any data file you touch), keep Persian/English language rules, never invent numbers (null + UNVERIFIED + verify_how when unknown), preserve provenance (as_of, confidence, sources).
Actions touching code under packages/ or apps/ are NOT yours: append them as a checklist to ${ROOT}/docs/04-decisions/CODE-ACTIONS.md (cluster id, file, change, severity) and list them in "skipped".
Do not git commit/push. If two actions conflict, follow the one from the higher-severity cluster and note it.
Return the structured result (area, filesChanged, adrsWritten, skipped, notes).`

if (stage === 'critique') {
  phase('Critique')
  const keys = (args.critics || []).filter((k) => CRITICS[k])
  if (!keys.length) throw new Error('args.critics must list valid critic keys: ' + Object.keys(CRITICS).join(', '))
  const out = await parallel(keys.map((k) => () => agent(critiquePrompt(k), { label: `critic:${k}`, phase: 'Critique', schema: ISSUES_SCHEMA })))
  return { critics: out.filter(Boolean) }
}

if (stage === 'cluster') {
  phase('Cluster')
  const r = await agent(clusterPrompt(), { label: 'moderator', phase: 'Cluster', schema: CLUSTER_SCHEMA })
  return r
}

if (stage === 'resolve') {
  phase('Resolve')
  const ids = args.clusterIds || []
  if (!ids.length) throw new Error('args.clusterIds required')
  const results = await pipeline(
    ids,
    (id) =>
      parallel([
        () => agent(sidePrompt('advocate', id), { label: `advocate:${id}`, phase: 'Resolve' }),
        () => agent(sidePrompt('skeptic', id), { label: `skeptic:${id}`, phase: 'Resolve' }),
      ]).then(() => id),
    (id) => agent(judgePrompt(id), { label: `judge:${id}`, phase: 'Resolve', schema: DECISION_SCHEMA }),
  )
  return { decisions: results.filter(Boolean) }
}

if (stage === 'patch') {
  phase('Patch')
  const areas = args.areas || ['architecture', 'research', 'compliance', 'ops', 'ux', 'sim', 'catalog', 'pricing', 'other']
  const out = await parallel(areas.map((a) => () => agent(patchPrompt(a), { label: `patch:${a}`, phase: 'Patch', schema: PATCH_SCHEMA })))
  return { patches: out.filter(Boolean) }
}

throw new Error('args.stage must be one of: critique | cluster | resolve | patch')
