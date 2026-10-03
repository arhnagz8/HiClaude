/**
 * Dependency-free inline-SVG chart library (line/area, bar grouped/stacked/horizontal, heatmap, tornado, sparkline) used only by the
 * report generator. Follows the dataviz mark specs: 2px lines, ≤24px bars with 4px rounded data-ends and 2px gaps, ≥8px markers with a
 * surface ring, hairline solid grid, text in text tokens (never the series colour), legend for ≥2 series, hover via `data-tip`.
 * Colours come from CSS classes `.s1…s8` / `.f1…f8` / `.k1…k8` defined in reports/style.ts (light + dark tokens, validated palette slots in order).
 * Charts are LTR (time runs left→right) even inside the RTL page; labels are supplied by the caller (already localised).
 */
import { escapeHtml } from './i18n'

export interface Series {
  id: string
  label: string
  values: Array<number | null>
  /** categorical slot 1..8 (default: series index + 1) */
  slot?: number
}

export interface Axis {
  /** per-category labels (already localised) */
  labels: string[]
  /** indices that get a tick label (default: auto every k so ≤ 9 labels) */
  tickIdx?: number[]
}

export interface ChartBase {
  id: string
  width?: number
  height?: number
  /** aria-label / title for screen readers */
  aria: string
  yFormat: (v: number) => string
  /** tooltip value formatter (default: yFormat) */
  tipFormat?: (v: number) => string
  yMin?: number
  yMax?: number
  /** include 0 in the y-domain (default true) */
  includeZero?: boolean
  /** shown top-left of the plot (unit caption) */
  unitLabel?: string
}

export interface Band {
  from: number
  to: number
  slot: number
  label: string
}
export interface Marker {
  x: number
  label: string
  severity?: 'info' | 'warning' | 'critical'
}
export interface HRef {
  y: number
  label: string
}

const M = { l: 58, r: 62, t: 22, b: 30 }
const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

export function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const f = range / Math.pow(10, exp)
  let nf: number
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nf * Math.pow(10, exp)
}

export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 }
  if (min === max) {
    if (min === 0) return { ticks: [0, 1], min: 0, max: 1 }
    const d = Math.abs(min) * 0.1
    min -= d
    max += d
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / Math.max(1, count - 1), true)
  const nmin = Math.floor(min / step) * step
  const nmax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = nmin; v <= nmax + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v / step) * step)
  return { ticks, min: nmin, max: nmax }
}

export function autoTicks(n: number, maxLabels = 9): number[] {
  if (n <= 0) return []
  const k = Math.max(1, Math.ceil(n / maxLabels))
  const out: number[] = []
  for (let i = 0; i < n; i += k) out.push(i)
  return out
}

function domain(series: Series[], o: ChartBase, extra: number[] = []): { ticks: number[]; min: number; max: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const s of series) for (const v of s.values) if (v !== null && Number.isFinite(v)) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  for (const e of extra) {
    if (e < lo) lo = e
    if (e > hi) hi = e
  }
  if (!Number.isFinite(lo)) {
    lo = 0
    hi = 1
  }
  if (o.includeZero !== false) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  } else {
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1
    lo -= pad
    hi += pad
  }
  if (o.yMin !== undefined) lo = o.yMin
  if (o.yMax !== undefined) hi = o.yMax
  const t = niceTicks(lo, hi, 5)
  return { ticks: t.ticks, min: o.yMin ?? t.min, max: o.yMax ?? t.max }
}

const slotOf = (s: Series, i: number): number => ((s.slot ?? i + 1) - 1) % 8 + 1

function frame(o: ChartBase, body: string, extraSvg = ''): string {
  const w = o.width ?? 720
  const h = o.height ?? 260
  return `<svg class="chart" id="${escapeHtml(o.id)}" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(o.aria)}" preserveAspectRatio="xMidYMid meet" direction="ltr" font-size="11">${body}${extraSvg}</svg>`
}

function yGrid(o: ChartBase, d: { ticks: number[]; min: number; max: number }, w: number, h: number): { y: (v: number) => number; svg: string } {
  const plotH = h - M.t - M.b
  const y = (v: number): number => M.t + plotH - ((v - d.min) / (d.max - d.min || 1)) * plotH
  let svg = ''
  for (const t of d.ticks) {
    const yy = y(t)
    svg += `<line class="grid${t === 0 ? ' base' : ''}" x1="${M.l}" x2="${w - M.r}" y1="${f1(yy)}" y2="${f1(yy)}"/>`
    svg += `<text class="ax" x="${M.l - 8}" y="${f1(yy + 3.5)}" text-anchor="end">${escapeHtml(o.yFormat(t))}</text>`
  }
  if (o.unitLabel) svg += `<text class="ax unit" x="${M.l}" y="11" text-anchor="start">${escapeHtml(o.unitLabel)}</text>`
  return { y, svg }
}

function xLabels(axis: Axis, xAt: (i: number) => number, h: number): string {
  const idx = axis.tickIdx ?? autoTicks(axis.labels.length)
  return idx.map((i) => `<text class="ax" x="${f1(xAt(i))}" y="${h - 9}" text-anchor="middle">${escapeHtml(axis.labels[i] ?? '')}</text>`).join('')
}

// ───────────────────────── line / area ─────────────────────────
export interface LineOpts extends ChartBase {
  axis: Axis
  /** fill ~10 % under the (single) first series */
  area?: boolean
  bands?: Band[]
  markers?: Marker[]
  hRefs?: HRef[]
  /** label the last value of each series (skipped when labels would collide) */
  endLabels?: boolean
  /** max hover columns (downsampled) */
  maxHover?: number
}

export function lineChart(series: Series[], o: LineOpts): string {
  const w = o.width ?? 720
  const h = o.height ?? 260
  const n = o.axis.labels.length
  const d = domain(series, o, (o.hRefs ?? []).map((r) => r.y))
  const { y, svg: grid } = yGrid(o, d, w, h)
  const plotW = w - M.l - M.r
  const xAt = (i: number): number => (n <= 1 ? M.l + plotW / 2 : M.l + (i * plotW) / (n - 1))
  let out = grid
  for (const b of o.bands ?? []) {
    const x1 = xAt(Math.max(0, b.from))
    const x2 = xAt(Math.min(n - 1, b.to))
    out += `<rect class="band f${b.slot}" x="${f1(x1)}" y="${M.t}" width="${f1(Math.max(1, x2 - x1))}" height="${h - M.t - M.b}"><title>${escapeHtml(b.label)}</title></rect>`
  }
  for (const r of o.hRefs ?? []) out += `<line class="href" x1="${M.l}" x2="${w - M.r}" y1="${f1(y(r.y))}" y2="${f1(y(r.y))}"/><text class="ax" x="${w - M.r + 4}" y="${f1(y(r.y) + 3.5)}">${escapeHtml(r.label)}</text>`
  out += xLabels(o.axis, xAt, h)
  series.forEach((s, si) => {
    const k = slotOf(s, si)
    let path = ''
    let pen = false
    let first = -1
    let last = -1
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false
        return
      }
      path += `${pen ? 'L' : 'M'}${f1(xAt(i))} ${f1(y(v))}`
      pen = true
      if (first < 0) first = i
      last = i
    })
    if (o.area && si === 0 && first >= 0) out += `<path class="area f${k}" d="${path}L${f1(xAt(last))} ${f1(y(Math.max(0, d.min)))}L${f1(xAt(first))} ${f1(y(Math.max(0, d.min)))}Z"/>`
    out += `<path class="ln k${k}" d="${path}"/>`
    if (n <= 40) s.values.forEach((v, i) => {
      if (v !== null && Number.isFinite(v) && n <= 40) out += `<circle class="dot f${k}" cx="${f1(xAt(i))}" cy="${f1(y(v))}" r="4"/>`
    })
  })
  if (o.endLabels !== false && series.length >= 1) {
    const ends = series
      .map((s, si) => {
        const i = lastIdx(s.values)
        return i < 0 ? null : { si, i, v: s.values[i] as number, yy: y(s.values[i] as number), k: slotOf(s, si) }
      })
      .filter((e): e is { si: number; i: number; v: number; yy: number; k: number } => e !== null)
      .sort((a, b) => a.yy - b.yy)
    const ok = ends.every((e, j) => j === 0 || e.yy - (ends[j - 1] as { yy: number }).yy >= 13)
    if (ok) for (const e of ends) out += `<circle class="dot f${e.k}" cx="${f1(xAt(e.i))}" cy="${f1(e.yy)}" r="4"/><text class="end" x="${f1(xAt(e.i) + 8)}" y="${f1(e.yy + 3.5)}">${escapeHtml(o.yFormat(e.v))}</text>`
  }
  ;(o.markers ?? []).forEach((m, mi) => {
    const x = xAt(Math.max(0, Math.min(n - 1, m.x)))
    out += `<line class="mk ${m.severity ?? 'info'}" x1="${f1(x)}" x2="${f1(x)}" y1="${M.t}" y2="${h - M.b}"/><circle class="mkdot ${m.severity ?? 'info'}" cx="${f1(x)}" cy="${M.t + 4}" r="8"/><text class="mknum" x="${f1(x)}" y="${M.t + 7.5}" text-anchor="middle">${mi + 1}</text><title>${escapeHtml(m.label)}</title>`
  })
  // hover columns + crosshair
  const maxHover = o.maxHover ?? 140
  const step = Math.max(1, Math.ceil(n / maxHover))
  const tipFmt = o.tipFormat ?? o.yFormat
  out += `<line class="xh" x1="0" x2="0" y1="${M.t}" y2="${h - M.b}"/>`
  for (let i = 0; i < n; i += step) {
    const x = xAt(i)
    const half = (plotW / Math.max(1, n - 1)) * step * 0.5
    const lines = [o.axis.labels[i] ?? '', ...series.map((s) => `${s.label}: ${s.values[i] === null || s.values[i] === undefined ? '—' : tipFmt(s.values[i] as number)}`)]
    out += `<rect class="hov" x="${f1(Math.max(M.l, x - half))}" y="${M.t}" width="${f1(Math.max(2, half * 2))}" height="${h - M.t - M.b}" data-x="${f1(x)}" data-tip="${escapeHtml(lines.join('|'))}"/>`
  }
  return frame(o, out)
}

const lastIdx = (v: Array<number | null>): number => {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null && Number.isFinite(v[i] as number)) return i
  return -1
}

// ───────────────────────── bars ─────────────────────────
export interface BarOpts extends ChartBase {
  axis: Axis
  stacked?: boolean
  hRefs?: HRef[]
}

function roundedRect(x: number, y: number, w: number, h: number, r: number, top: boolean, bottom: boolean): string {
  const rt = top ? Math.min(r, w / 2, h) : 0
  const rb = bottom ? Math.min(r, w / 2, h) : 0
  return `M${f1(x)} ${f1(y + rt)}${rt ? `Q${f1(x)} ${f1(y)} ${f1(x + rt)} ${f1(y)}` : ''}H${f1(x + w - rt)}${rt ? `Q${f1(x + w)} ${f1(y)} ${f1(x + w)} ${f1(y + rt)}` : ''}V${f1(y + h - rb)}${rb ? `Q${f1(x + w)} ${f1(y + h)} ${f1(x + w - rb)} ${f1(y + h)}` : ''}H${f1(x + rb)}${rb ? `Q${f1(x)} ${f1(y + h)} ${f1(x)} ${f1(y + h - rb)}` : ''}Z`
}

export function barChart(series: Series[], o: BarOpts): string {
  const w = o.width ?? 720
  const h = o.height ?? 260
  const n = o.axis.labels.length
  // domain: stacked uses cumulative sums
  let dom: { ticks: number[]; min: number; max: number }
  if (o.stacked) {
    const pos: number[] = []
    const neg: number[] = []
    for (let i = 0; i < n; i++) {
      let p = 0
      let q = 0
      for (const s of series) {
        const v = s.values[i]
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          if (v >= 0) p += v
          else q += v
        }
      }
      pos.push(p)
      neg.push(q)
    }
    dom = domain([{ id: 'p', label: '', values: pos }, { id: 'n', label: '', values: neg }], o, (o.hRefs ?? []).map((r) => r.y))
  } else dom = domain(series, { ...o, includeZero: true }, (o.hRefs ?? []).map((r) => r.y))
  const { y, svg: grid } = yGrid(o, dom, w, h)
  const plotW = w - M.l - M.r
  const band = plotW / Math.max(1, n)
  const group = o.stacked ? 1 : series.length
  const barW = Math.max(2, Math.min(24, (band - 4) / group - 2))
  const groupW = group * barW + (group - 1) * 2
  let out = grid
  const xc = (i: number): number => M.l + band * i + band / 2
  out += xLabels(o.axis, xc, h)
  for (const r of o.hRefs ?? []) out += `<line class="href" x1="${M.l}" x2="${w - M.r}" y1="${f1(y(r.y))}" y2="${f1(y(r.y))}"/><text class="ax" x="${w - M.r + 4}" y="${f1(y(r.y) + 3.5)}">${escapeHtml(r.label)}</text>`
  const tipFmt = o.tipFormat ?? o.yFormat
  const zero = y(0)
  for (let i = 0; i < n; i++) {
    const tip = [o.axis.labels[i] ?? '', ...series.map((s) => `${s.label}: ${s.values[i] === null || s.values[i] === undefined ? '—' : tipFmt(s.values[i] as number)}`)].join('|')
    let up = 0
    let dn = 0
    const segs: string[] = []
    series.forEach((s, si) => {
      const v = s.values[i]
      if (v === null || v === undefined || !Number.isFinite(v)) return
      const k = slotOf(s, si)
      if (o.stacked) {
        const base = v >= 0 ? up : dn
        const y0 = y(base)
        const y1 = y(base + v)
        const top = Math.min(y0, y1)
        const hh = Math.max(0, Math.abs(y1 - y0) - 2) // 2px surface gap between segments
        const last = series.slice(si + 1).every((t) => !(t.values[i] !== null && t.values[i] !== undefined && (v >= 0 ? (t.values[i] as number) >= 0 : (t.values[i] as number) < 0)))
        if (v >= 0) up += v
        else dn += v
        if (hh > 0.4) segs.push(`<path class="bar f${k}" d="${roundedRect(xc(i) - barW / 2, v >= 0 ? top : top + 2, barW, hh, 4, v >= 0 && last, v < 0 && last)}"/>`)
      } else {
        const x = xc(i) - groupW / 2 + si * (barW + 2)
        const yy = y(v)
        const top = Math.min(yy, zero)
        const hh = Math.max(0.5, Math.abs(yy - zero))
        segs.push(`<path class="bar f${k}" d="${roundedRect(x, top, barW, hh, 4, v >= 0, v < 0)}"/>`)
      }
    })
    out += `<g class="barg" data-tip="${escapeHtml(tip)}"><rect class="hit" x="${f1(M.l + band * i)}" y="${M.t}" width="${f1(band)}" height="${h - M.t - M.b}"/>${segs.join('')}</g>`
  }
  return frame(o, out)
}

export interface HBarRow {
  label: string
  value: number
  /** secondary text after the value label (e.g. "n = 120") */
  note?: string
  slot?: number
}
export interface HBarOpts {
  id: string
  aria: string
  width?: number
  rowH?: number
  format: (v: number) => string
  /** left label gutter */
  labelW?: number
  maxValue?: number
  slot?: number
}

/** Horizontal bars (value at the bar tip), one series. */
export function hbarChart(rows: HBarRow[], o: HBarOpts): string {
  const w = o.width ?? 360
  const rowH = o.rowH ?? 26
  const labelW = o.labelW ?? 110
  const h = Math.max(40, rows.length * rowH + 10)
  const max = Math.max(o.maxValue ?? 0, ...rows.map((r) => r.value), 1e-9)
  const min = Math.min(0, ...rows.map((r) => r.value))
  const plotW = w - labelW - 70
  const x = (v: number): number => labelW + ((v - min) / (max - min || 1)) * plotW
  let out = ''
  const x0 = x(0)
  out += `<line class="grid base" x1="${f1(x0)}" x2="${f1(x0)}" y1="2" y2="${h - 4}"/>`
  rows.forEach((r, i) => {
    const yy = 5 + i * rowH
    const bh = Math.min(16, rowH - 8)
    const xv = x(r.value)
    const k = r.slot ?? o.slot ?? 1
    const left = Math.min(x0, xv)
    const wd = Math.max(1, Math.abs(xv - x0))
    out += `<text class="ax lab" x="${labelW - 8}" y="${f1(yy + bh / 2 + 3.5)}" text-anchor="end">${escapeHtml(r.label)}</text>`
    out += `<g class="barg" data-tip="${escapeHtml(`${r.label}|${o.format(r.value)}${r.note ? `|${r.note}` : ''}`)}"><rect class="hit" x="0" y="${yy - 2}" width="${w}" height="${rowH - 2}"/><path class="bar f${k}" d="${roundedRect(left, yy, wd, bh, 4, r.value >= 0, r.value < 0).replace(/Z$/, 'Z')}"/></g>`
    out += `<text class="end" x="${f1(r.value >= 0 ? left + wd + 6 : left - 6)}" y="${f1(yy + bh / 2 + 3.5)}" text-anchor="${r.value >= 0 ? 'start' : 'end'}">${escapeHtml(o.format(r.value))}</text>`
  })
  return `<svg class="chart" id="${escapeHtml(o.id)}" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(o.aria)}" direction="ltr" font-size="11">${out}</svg>`
}

// ───────────────────────── heatmap ─────────────────────────
export interface HeatOpts {
  id: string
  aria: string
  width?: number
  rowLabels: string[]
  colLabels: string[]
  /** value → text inside cell when cells are wide enough */
  format: (v: number) => string
  max?: number
  rowLabelEvery?: number
  colLabelEvery?: number
  title?: (r: number, c: number, v: number) => string
}

/** Sequential single-hue ramp (blue 100→700 of the reference palette) – lightest = near zero. */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1)
  return RAMP[Math.round(x)] as string
}
const darkText = (t: number): boolean => t < 0.55

export function heatmap(matrix: Array<Array<number | null>>, o: HeatOpts): string {
  const rows = matrix.length
  const cols = Math.max(1, ...matrix.map((r) => r.length), o.colLabels.length)
  const w = o.width ?? 720
  const labW = 62
  const topH = 24
  const cell = Math.max(6, Math.min(34, Math.floor((w - labW - 10) / cols)))
  const gap = cell >= 14 ? 2 : 1
  const h = topH + rows * cell + 8
  const max = o.max ?? Math.max(1e-9, ...matrix.flat().map((v) => (v === null ? 0 : v)))
  let out = ''
  const rl = o.rowLabelEvery ?? Math.max(1, Math.ceil(rows / 12))
  const cl = o.colLabelEvery ?? Math.max(1, Math.ceil(cols / 12))
  for (let c = 0; c < cols; c += cl) out += `<text class="ax" x="${labW + c * cell + cell / 2}" y="${topH - 8}" text-anchor="middle">${escapeHtml(o.colLabels[c] ?? '')}</text>`
  matrix.forEach((row, r) => {
    if (r % rl === 0) out += `<text class="ax" x="${labW - 6}" y="${topH + r * cell + cell / 2 + 3.5}" text-anchor="end">${escapeHtml(o.rowLabels[r] ?? '')}</text>`
    row.forEach((v, c) => {
      if (v === null) return
      const t = v / max
      const tip = o.title ? o.title(r, c, v) : `${o.rowLabels[r] ?? ''} · ${o.colLabels[c] ?? ''}|${o.format(v)}`
      out += `<g class="barg" data-tip="${escapeHtml(tip)}"><rect class="cell" x="${labW + c * cell}" y="${topH + r * cell}" width="${cell - gap}" height="${cell - gap}" rx="2" style="fill:${rampColor(t)}"/>`
      if (cell >= 30) out += `<text class="cellt ${darkText(t) ? 'dk' : 'lt'}" x="${labW + c * cell + (cell - gap) / 2}" y="${topH + r * cell + cell / 2 + 3}" text-anchor="middle">${escapeHtml(o.format(v))}</text>`
      out += '</g>'
    })
  })
  return `<svg class="chart" id="${escapeHtml(o.id)}" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(o.aria)}" direction="ltr" font-size="11">${out}</svg>`
}

// ───────────────────────── tornado ─────────────────────────
export interface TornadoBar {
  label: string
  lowValue: number
  highValue: number
  lowLabel: string
  highLabel: string
}
export interface TornadoOpts {
  id: string
  aria: string
  width?: number
  base: number
  format: (v: number) => string
  labelW?: number
  lowSlot?: number
  highSlot?: number
  noise?: number
}

/** Tornado: bars extend from the base value to the metric under the low / high setting of each parameter; sorted by swing. */
export function tornado(rowsIn: TornadoBar[], o: TornadoOpts): string {
  const rows = [...rowsIn].sort((a, b) => Math.abs(b.highValue - b.lowValue) - Math.abs(a.highValue - a.lowValue))
  const w = o.width ?? 720
  const labelW = o.labelW ?? 150
  const rowH = 30
  const topH = 22
  const botH = 26
  const h = topH + rows.length * rowH + botH
  let lo = o.base
  let hi = o.base
  for (const r of rows) {
    lo = Math.min(lo, r.lowValue, r.highValue)
    hi = Math.max(hi, r.lowValue, r.highValue)
  }
  const t = niceTicks(lo, hi, 5)
  const plotL = labelW
  const plotR = w - 70
  const x = (v: number): number => plotL + ((v - t.min) / (t.max - t.min || 1)) * (plotR - plotL)
  let out = ''
  for (const tk of t.ticks) out += `<line class="grid" x1="${f1(x(tk))}" x2="${f1(x(tk))}" y1="${topH - 6}" y2="${h - botH + 4}"/><text class="ax" x="${f1(x(tk))}" y="${h - 8}" text-anchor="middle">${escapeHtml(o.format(tk))}</text>`
  if (o.noise && o.noise > 0) out += `<rect class="noise" x="${f1(x(o.base - o.noise))}" y="${topH - 6}" width="${f1(x(o.base + o.noise) - x(o.base - o.noise))}" height="${h - botH - topH + 10}"><title>±1σ across seeds</title></rect>`
  const bx = x(o.base)
  out += `<line class="grid base" x1="${f1(bx)}" x2="${f1(bx)}" y1="${topH - 8}" y2="${h - botH + 6}"/><text class="ax" x="${f1(bx)}" y="12" text-anchor="middle">${escapeHtml(o.format(o.base))}</text>`
  rows.forEach((r, i) => {
    const yy = topH + i * rowH
    const bh = 16
    out += `<text class="ax lab" x="${labelW - 10}" y="${yy + bh / 2 + 3.5}" text-anchor="end">${escapeHtml(r.label)}</text>`
    for (const side of ['low', 'high'] as const) {
      const v = side === 'low' ? r.lowValue : r.highValue
      const k = side === 'low' ? o.lowSlot ?? 2 : o.highSlot ?? 1
      const xv = x(v)
      const left = Math.min(bx, xv)
      const wd = Math.max(1.5, Math.abs(xv - bx))
      const lab = side === 'low' ? r.lowLabel : r.highLabel
      out += `<g class="barg" data-tip="${escapeHtml(`${r.label}|${lab}: ${o.format(v)}|Δ ${o.format(v - o.base)}`)}"><rect class="hit" x="${f1(left - 2)}" y="${yy - 3}" width="${f1(wd + 4)}" height="${rowH - 4}"/><path class="bar f${k}" d="${roundedRect(left, yy, wd, bh, 4, false, false).replace(/Z$/, 'Z')}"/></g>`
      out += `<text class="end" x="${f1(xv < bx ? left - 5 : left + wd + 5)}" y="${yy + bh / 2 + 3.5}" text-anchor="${xv < bx ? 'end' : 'start'}">${escapeHtml(lab)}</text>`
    }
  })
  return `<svg class="chart" id="${escapeHtml(o.id)}" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(o.aria)}" direction="ltr" font-size="11">${out}</svg>`
}

// ───────────────────────── sparkline ─────────────────────────
export function sparkline(values: number[], opts: { width?: number; height?: number; slot?: number; id?: string } = {}): string {
  const w = opts.width ?? 120
  const h = opts.height ?? 32
  const v = values.filter((x) => Number.isFinite(x))
  if (v.length < 2) return ''
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  const x = (i: number): number => 3 + (i * (w - 10)) / (v.length - 1)
  const y = (val: number): number => h - 5 - ((val - lo) / (hi - lo || 1)) * (h - 10)
  const path = v.map((val, i) => `${i === 0 ? 'M' : 'L'}${f1(x(i))} ${f1(y(val))}`).join('')
  const k = opts.slot ?? 1
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" direction="ltr"><path class="ln k${k}" d="${path}"/><circle class="dot f${k}" cx="${f1(x(v.length - 1))}" cy="${f1(y(v[v.length - 1] as number))}" r="3.5"/></svg>`
}

// ───────────────────────── legend & data table ─────────────────────────
export function legendHtml(items: Array<{ label: string; slot: number; kind?: 'line' | 'bar' }>): string {
  if (items.length < 2) return ''
  return `<div class="legend">${items.map((i) => `<span class="lg"><i class="sw ${i.kind === 'bar' ? 'bar' : 'line'} f${i.slot}"></i>${escapeHtml(i.label)}</span>`).join('')}</div>`
}

export function markerLegend(markers: Marker[]): string {
  if (markers.length === 0) return ''
  return `<ol class="mklist">${markers.map((m) => `<li class="${m.severity ?? 'info'}">${escapeHtml(m.label)}</li>`).join('')}</ol>`
}

/** Accessible table view of a chart (all categories; long daily series are thinned to ≤ maxRows). */
export function dataTable(labels: string[], series: Series[], fmt: (v: number) => string, summary: string, maxRows = 60): string {
  const step = Math.max(1, Math.ceil(labels.length / maxRows))
  const head = `<tr><th></th>${series.map((s) => `<th>${escapeHtml(s.label)}</th>`).join('')}</tr>`
  let body = ''
  for (let i = 0; i < labels.length; i += step) body += `<tr><th>${escapeHtml(labels[i] ?? '')}</th>${series.map((s) => `<td>${s.values[i] === null || s.values[i] === undefined ? '—' : escapeHtml(fmt(s.values[i] as number))}</td>`).join('')}</tr>`
  return `<details class="tv"><summary>${escapeHtml(summary)}</summary><div class="tvw"><table class="dt">${head}${body}</table></div></details>`
}
