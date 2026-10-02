# Workflow scripts (re-runnable orchestrations)

Run with the Claude Code `Workflow` tool: `Workflow({ scriptPath: "<abs path>", args: {...} })`.
All stages exchange data through files so they can be resumed or run in parallel workflows.

| Script | Purpose | args |
|---|---|---|
| `research.js` | domain specialists (each followed by an independent verifier) | `{ keys: ["01-card-providers", ...] }` (mandates in `docs/03-research/_briefs/`) |
| `debate.js` | multi-perspective critique → cluster → advocate/skeptic/judge → patch + ADRs | `{ stage: "critique"|"cluster"|"resolve"|"patch", ... }` |
| `owner-review-loop.js` | owner-proxy walks the 0→100 journey from the context pack; fillers close gaps; repeat until dry | `{ maxRounds, entry, focus }` |

Notes: concurrency per workflow = min(16, CPUs−2); run several workflows in parallel for more throughput.
