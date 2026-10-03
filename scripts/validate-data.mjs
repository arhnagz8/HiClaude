#!/usr/bin/env node
// Validates data/*.json "Record" leaves (objects that contain a `value` key) against data/_schema/record.schema.json rules.
// Usage: node scripts/validate-data.mjs [files...]   (default: every data/**/*.json except _schema)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const CONF = new Set(['high', 'medium', 'low'])
const STATUS = new Set(['verified', 'reported', 'UNVERIFIED', 'conflicting'])
const DATE = /^\d{4}-\d{2}-\d{2}$/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '_schema' || name === 'node_modules' || name === 'sim' || name === 'config' || name === 'copy.fa.json') continue // plain runtime/config content, not provenance Records
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

const args = process.argv.slice(2)
const files = args.length ? args.map((f) => (f.startsWith('/') ? f : join(process.cwd(), f))) : walk(join(root, 'data'))
let errors = 0
let records = 0
let unverified = 0

function err(file, path, msg) {
  errors++
  console.error(`✗ ${relative(root, file)} :: ${path || '$'} :: ${msg}`)
}

function visit(file, node, path) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => visit(file, n, `${path}[${i}]`))
    return
  }
  if (node === null || typeof node !== 'object') return
  if (Object.prototype.hasOwnProperty.call(node, 'value')) {
    records++
    if (!('as_of' in node) || !DATE.test(String(node.as_of))) err(file, path, 'record missing/invalid as_of (YYYY-MM-DD)')
    if (!CONF.has(node.confidence)) err(file, path, 'record missing/invalid confidence (high|medium|low)')
    if (node.status !== undefined && !STATUS.has(node.status)) err(file, path, `invalid status ${node.status}`)
    if (node.value === null) {
      unverified++
      if (node.status !== 'UNVERIFIED' && !node.note) err(file, path, 'null value needs status "UNVERIFIED" (or a note) and verify_how')
      if (!node.verify_how) err(file, path, 'null value needs verify_how')
    } else if ((node.confidence === 'high' || node.confidence === 'medium') && node.status !== 'UNVERIFIED') {
      if (!Array.isArray(node.sources) || node.sources.length === 0) err(file, path, 'high/medium confidence record needs sources[]')
    }
    if (Array.isArray(node.sources)) node.sources.forEach((s, i) => { if (!s || typeof s.url !== 'string' || !s.url) err(file, `${path}.sources[${i}]`, 'source needs url') })
    // do not descend into the record's own value if it is a primitive; do descend into object/array values (nested records)
    if (node.value && typeof node.value === 'object') visit(file, node.value, `${path}.value`)
    return
  }
  for (const [k, v] of Object.entries(node)) visit(file, v, path ? `${path}.${k}` : k)
}

for (const f of files) {
  let json
  try {
    json = JSON.parse(readFileSync(f, 'utf8'))
  } catch (e) {
    err(f, '', `invalid JSON: ${e.message}`)
    continue
  }
  visit(f, json, '')
}

if (errors) {
  console.error(`\n${errors} error(s) in ${files.length} file(s); ${records} records (${unverified} UNVERIFIED)`)
  process.exit(1)
}
console.log(`OK — ${files.length} file(s), ${records} records (${unverified} UNVERIFIED)`)
