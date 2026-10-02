/**
 * File layer of the config stack (architecture §17): `data/config/*.json`.
 * File name → top-level PlatformParams key: `pricing.json`, `paymentMethods.json`, `exchanges.json`, `providers.json`, …
 * A file holds either the section itself or `{ "<section>": {...}, "provenance": {...} }` (provenance/_meta/$schema are ignored here).
 * Sections are deep-merged over the base (arrays replaced wholesale) and validated; an invalid file aborts with its name in the message.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ZodError } from 'zod'
import { defaultPlatformParams, deepMerge, parsePlatformParams, PlatformParamsSchema, type DeepPartial, type PlatformParams } from '@hiclaude/contracts'
import { isPlainObject } from '../util'

export const PARAM_SECTIONS = Object.keys(PlatformParamsSchema.shape) as (keyof PlatformParams)[]
const IGNORED_WRAPPER_KEYS = new Set(['provenance', '_meta', '$schema', '_provenance', 'notes'])

export class ConfigFileError extends Error {
  constructor(readonly file: string, message: string) {
    super(`config ${file}: ${message}`)
    this.name = 'ConfigFileError'
  }
}

export interface LoadedParams {
  partial: DeepPartial<PlatformParams>
  files: string[]
}

/** Reads and (per-file) shape-checks the JSON sections found in `dir` (default `<dataDir>/config`). Missing directory → empty. */
export function loadParamsFromDir(dataDir: string, base: PlatformParams = defaultPlatformParams()): LoadedParams {
  const dir = join(dataDir, 'config')
  const out: Record<string, unknown> = {}
  const files: string[] = []
  if (!existsSync(dir)) return { partial: {}, files }
  let merged = base
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const section = f.slice(0, -5)
    if (!(PARAM_SECTIONS as string[]).includes(section)) continue // other config files (e.g. provenance maps) are not param sections
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    } catch (e) {
      throw new ConfigFileError(f, `invalid JSON (${(e as Error).message})`)
    }
    let value: unknown = raw
    if (isPlainObject(raw) && section in raw && Object.keys(raw).every((k) => k === section || IGNORED_WRAPPER_KEYS.has(k))) value = raw[section]
    try {
      merged = parsePlatformParams(deepMerge(merged, { [section]: value } as DeepPartial<PlatformParams>))
    } catch (e) {
      if (e instanceof ZodError) throw new ConfigFileError(f, e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
      throw e
    }
    out[section] = value
    files.push(f)
  }
  return { partial: out as DeepPartial<PlatformParams>, files }
}

/** defaults ← data/config/*.json, validated. Use as `AppDeps.params` (or let `createApp({dataDir})` do it). */
export function loadPlatformParams(dataDir: string, base: PlatformParams = defaultPlatformParams()): PlatformParams {
  const { partial } = loadParamsFromDir(dataDir, base)
  return parsePlatformParams(deepMerge(base, partial))
}
