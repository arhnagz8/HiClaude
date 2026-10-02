export const meta = {
  name: 'owner-review-loop',
  description: 'Owner-proxy agent walks the 0→100 journey using ONLY the context pack, lists every gap/question, fillers close them; repeat until dry',
  phases: [
    { title: 'Review', detail: 'owner-proxy walks the journey and lists gaps' },
    { title: 'Fill', detail: 'specialists close each gap (research + docs)' },
  ],
}

// args = { maxRounds?: number (default 3), entry?: string (default docs/00-START-HERE.md), focus?: string }
const ROOT = '/home/user/HiClaude'
const entry = (args && args.entry) || `${ROOT}/docs/00-START-HERE.md`
const maxRounds = (args && args.maxRounds) || 3
const focus = (args && args.focus) || ''

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready_to_execute', 'nearly_ready', 'not_ready'] },
    summary: { type: 'string' },
    steps_walked: { type: 'number' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          step: { type: 'string' },
          kind: { type: 'string', enum: ['missing_info', 'ambiguity', 'contradiction', 'stale_or_unverified', 'missing_template', 'missing_checklist', 'missing_cost_or_time', 'missing_decision_criteria', 'tooling_gap', 'other'] },
          severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'nit'] },
          question: { type: 'string' },
          where_to_fix: { type: 'string' },
          needs_web_research: { type: 'boolean' },
        },
        required: ['id', 'step', 'kind', 'severity', 'question'],
      },
    },
  },
  required: ['verdict', 'summary', 'gaps'],
}

const FILL_SCHEMA = {
  type: 'object',
  properties: { gapId: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } }, resolution: { type: 'string' }, stillOpen: { type: 'boolean' } },
  required: ['gapId', 'filesChanged', 'resolution', 'stillOpen'],
}

const reviewPrompt = (round) => `You are the OWNER's representative (round ${round + 1}). Persona: an Iranian entrepreneur, smart but not an engineer, who can convert Toman to USDT himself and wants to launch this business (white-label reseller of virtual cards, top-ups and digital services, website + Telegram/Bale Mini App) as fast as possible. Today is 2026-10-02 (10 Mehr 1405). You wake up tomorrow morning with ONLY the context pack: start at ${entry} and follow its links (docs/, data/, scripts/, reports/, the running demo instructions). You may open code only when the pack tells you to.

Read ${ROOT}/CLAUDE.md first (rules the project follows), then walk the journey 0→100 step by step exactly as if you were executing it tomorrow: legal/entity setup, accounts and suppliers, funding and float, pricing decisions, tech setup and go-live (mock → live), first customers, daily operations, treasury routine, accounting/tax, growth, incident handling. ${focus}
At EACH step ask: Do I know exactly what to do, in what order, with which links/numbers/templates/scripts/prices/timelines? Could a weak AI execute it from the text alone? Is every number sourced and current? Is the decision criterion explicit? Do the docs contradict each other or the code/demo?
Record every gap (missing info, ambiguity, contradiction, stale/unverified fact, missing template/checklist/cost/time/decision criteria, tooling gap) with severity (blocker = I cannot proceed; high = I'd likely make a costly mistake; medium = slows me; nit = polish), the exact question I would ask my advisor, and where in the pack it should be fixed. Also verify at least 10 concrete claims by opening the referenced files/data (do they exist? do numbers match?). If something the pack promises (demo, report, command) does not work, say so with the exact command and error.
Write the full review to ${ROOT}/docs/04-decisions/_work/owner-review-round-${round + 1}.md and return the structured result. Be demanding: "ready_to_execute" only if you would bet your own money on following the pack unchanged.`

const fillPrompt = (gap, round) => `You are a specialist closing one gap in the HiClaude context pack (round ${round + 1}). Today is 2026-10-02.
Read ${ROOT}/CLAUDE.md first (binding: guardrails — no evasion of KYC/AML, sanctions, geo-restrictions, borrowed identities/cards, structuring, referral farming; never invent numbers; Persian for owner docs, English for specs). Then the review ${ROOT}/docs/04-decisions/_work/owner-review-round-${round + 1}.md and this gap:
${JSON.stringify(gap)}
Close it: ${gap.needs_web_research ? 'research it first (ToolSearch "select:WebSearch,WebFetch"; WebFetch mostly blocked — use WebSearch in Persian and English; cross-check numbers; cite sources with as_of and confidence), then ' : ''}update or create the right document/data/template/script at the place indicated (${gap.where_to_fix || 'choose the best place and link it from docs/00-START-HERE.md'}). Keep data files valid (node ${ROOT}/scripts/validate-data.mjs). If it truly cannot be resolved (needs the owner's private info or a first-hand check), write the exact verification steps (who/where/what to ask, expected answer format) into docs/01-owner-journey/ and mark stillOpen=true.
Do not git commit/push. Return the structured result.`

let round = 0
let dry = 0
const history = []
while (round < maxRounds && dry < 1) {
  phase('Review')
  const review = await agent(reviewPrompt(round), { label: `owner-review:r${round + 1}`, phase: 'Review', schema: REVIEW_SCHEMA })
  if (!review) { log('review agent returned null; stopping'); break }
  const actionable = (review.gaps || []).filter((g) => g.severity !== 'nit')
  history.push({ round: round + 1, verdict: review.verdict, gaps: (review.gaps || []).length, actionable: actionable.length })
  log(`Round ${round + 1}: verdict=${review.verdict}, ${actionable.length} actionable gaps`)
  if (!actionable.length || review.verdict === 'ready_to_execute') { dry++; break }
  phase('Fill')
  const fills = await parallel(actionable.slice(0, 24).map((g) => () => agent(fillPrompt(g, round), { label: `fill:${g.id}`, phase: 'Fill', schema: FILL_SCHEMA })))
  const open = fills.filter((f) => f && f.stillOpen).length
  log(`Round ${round + 1}: filled ${fills.filter(Boolean).length}, still open ${open}`)
  if (actionable.length > 24) log(`NOTE: ${actionable.length - 24} actionable gaps deferred to the next round (cap 24 per round)`)
  round++
}
return { rounds: history }
