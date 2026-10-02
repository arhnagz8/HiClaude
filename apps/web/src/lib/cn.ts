/** Tiny classnames helper (no dependency). */
export type ClassValue = string | number | false | null | undefined | ClassValue[]
export function cn(...v: ClassValue[]): string {
  const out: string[] = []
  const walk = (x: ClassValue): void => {
    if (!x && x !== 0) return
    if (Array.isArray(x)) x.forEach(walk)
    else out.push(String(x))
  }
  v.forEach(walk)
  return out.join(' ')
}
