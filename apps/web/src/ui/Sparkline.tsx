import { useId } from 'react'
import { cn } from '../lib/cn'

/** Pure-SVG sparkline. `values` are chronological (oldest first); in RTL the newest point is at the visual START (left→right time is kept: charts are LTR by convention for time axes). */
export function Sparkline({ values, width = 160, height = 48, tone = 'primary', className, label }: { values: number[]; width?: number; height?: number; tone?: 'primary' | 'success' | 'danger'; className?: string; label?: string }) {
  const gid = useId()
  if (values.length < 2) return <svg width={width} height={height} aria-hidden className={className} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 3
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${(width - pad).toFixed(1)} ${height} L${pad} ${height} Z`
  const color = tone === 'danger' ? 'rgb(var(--c-danger))' : tone === 'success' ? 'rgb(var(--c-success))' : 'rgb(var(--c-primary))'
  const last = pts[pts.length - 1] as readonly [number, number]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn('overflow-visible', className)} style={{ direction: 'ltr' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} />
    </svg>
  )
}
