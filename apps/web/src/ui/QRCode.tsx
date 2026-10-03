import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'

/** QR code as inline SVG. The generator (qrcode-generator, ~20 kB, MIT) is loaded lazily only on payment screens. Always dark-on-white for scanner contrast. */
export function QRCode({ value, size = 168, label, className }: { value: string; size?: number; label: string; className?: string }) {
  const [svg, setSvg] = useState<{ d: string; n: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('qrcode-generator').then((m) => {
      if (cancelled) return
      const qr = (m.default as unknown as (type: number, level: string) => { addData(s: string): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean })(0, 'M')
      qr.addData(value)
      qr.make()
      const n = qr.getModuleCount()
      let d = ''
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
      setSvg({ d, n })
    })
    return () => {
      cancelled = true
    }
  }, [value])
  return (
    <div className={cn('inline-block rounded-md border border-line bg-white p-2', className)} style={{ width: size + 16, height: size + 16 }}>
      {svg ? (
        <svg viewBox={`-2 -2 ${svg.n + 4} ${svg.n + 4}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" style={{ direction: 'ltr' }}>
          <rect x="-2" y="-2" width={svg.n + 4} height={svg.n + 4} fill="#fff" />
          <path d={svg.d} fill="#000" />
        </svg>
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded bg-surface-3" aria-hidden />
      )}
    </div>
  )
}
