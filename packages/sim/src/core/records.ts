/**
 * Research data files wrap leaf facts as Records: {"value":..., "unit":..., "as_of":..., "confidence":..., "sources":[...]}.
 * `unwrapRecords` replaces every Record by its `value` (recursively), leaving everything else untouched.
 */
export interface RecordMeta {
  unit?: string
  as_of?: string
  confidence?: string
}

export function isRecordWrapper(v: unknown): v is { value: unknown } & RecordMeta {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (!('value' in o)) return false
  return 'unit' in o || 'as_of' in o || 'confidence' in o || 'sources' in o || 'verify_how' in o || 'status' in o
}

export function unwrapRecords(v: unknown): unknown {
  if (isRecordWrapper(v)) return unwrapRecords(v.value)
  if (Array.isArray(v)) return v.map(unwrapRecords)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = unwrapRecords(x)
    return out
  }
  return v
}

/** Like unwrapRecords but keeps `unit` next to the value: leaf -> {v, unit}. Used for unit-sensitive fields (percent vs fraction). */
export function readLeaf(v: unknown): { value: unknown; unit?: string } {
  if (isRecordWrapper(v)) return { value: unwrapRecords(v.value), unit: typeof v.unit === 'string' ? v.unit : undefined }
  return { value: unwrapRecords(v) }
}
