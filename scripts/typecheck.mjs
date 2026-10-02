#!/usr/bin/env node
// Type-checks every workspace that has a tsconfig.json (noEmit). Exit code != 0 if any fails.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url).pathname
const dirs = []
for (const group of ['packages', 'apps']) {
  const base = join(root, group)
  if (!existsSync(base)) continue
  for (const name of readdirSync(base)) {
    const d = join(base, name)
    if (existsSync(join(d, 'tsconfig.json'))) dirs.push(d)
  }
}
let failed = 0
for (const d of dirs) {
  const r = spawnSync('npx', ['tsc', '--noEmit', '-p', d], { stdio: 'inherit', cwd: root })
  if (r.status !== 0) { failed++; console.error(`✗ typecheck failed: ${d}`) } else console.log(`✓ ${d}`)
}
process.exit(failed ? 1 : 0)
