/**
 * Deterministic, seedable, forkable RNG. [CONTRACT]
 * `fork(name)` derives an INDEPENDENT stream from the seed path (not from the parent's consumption),
 * so adding a new stream never perturbs existing ones.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number
  /** True with probability p (default 0.5). */
  bool(p?: number): boolean
  /** Normal(mean, sd) via Box–Muller. */
  normal(mean?: number, sd?: number): number
  /** exp(Normal(mu, sigma)). */
  logNormal(mu: number, sigma: number): number
  /** Exponential with the given rate (events per unit). */
  exp(rate: number): number
  /** Poisson(lambda). Knuth for small lambda, normal approximation for large. */
  poisson(lambda: number): number
  pick<T>(arr: readonly T[]): T
  weighted<T>(items: readonly T[], weights: readonly number[]): T
  /** Fisher–Yates shuffle (in place) and returns the array. */
  shuffle<T>(arr: T[]): T[]
  /** Independent child stream identified by `name`. */
  fork(name: string): Rng
  /** The seed path, e.g. "1/macro/usdt". */
  readonly path: string
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0
    b |= 0
    c |= 0
    d |= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

class RngImpl implements Rng {
  private readonly gen: () => number
  private spare: number | null = null
  constructor(readonly path: string) {
    const [a, b, c, d] = cyrb128(path)
    this.gen = sfc32(a, b, c, d)
    for (let i = 0; i < 15; i++) this.gen() // warm-up
  }
  next(): number {
    return this.gen()
  }
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`int(${min}, ${max})`)
    return min + Math.floor(this.gen() * (max - min + 1))
  }
  bool(p = 0.5): boolean {
    return this.gen() < p
  }
  normal(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const s = this.spare
      this.spare = null
      return mean + sd * s
    }
    let u = 0
    let v = 0
    while (u === 0) u = this.gen()
    while (v === 0) v = this.gen()
    const mag = Math.sqrt(-2.0 * Math.log(u))
    this.spare = mag * Math.sin(2 * Math.PI * v)
    return mean + sd * mag * Math.cos(2 * Math.PI * v)
  }
  logNormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma))
  }
  exp(rate: number): number {
    let u = 0
    while (u === 0) u = this.gen()
    return -Math.log(u) / rate
  }
  poisson(lambda: number): number {
    if (lambda <= 0) return 0
    if (lambda >= 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))))
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= this.gen()
    } while (p > L)
    return k - 1
  }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new RangeError('pick() from empty array')
    return arr[Math.floor(this.gen() * arr.length)] as T
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) throw new RangeError('weighted(): bad input')
    let total = 0
    for (const w of weights) total += w
    if (!(total > 0)) throw new RangeError('weighted(): total weight must be > 0')
    let r = this.gen() * total
    for (let i = 0; i < items.length; i++) {
      r -= weights[i] as number
      if (r < 0) return items[i] as T
    }
    return items[items.length - 1] as T
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.gen() * (i + 1))
      const tmp = arr[i] as T
      arr[i] = arr[j] as T
      arr[j] = tmp
    }
    return arr
  }
  fork(name: string): Rng {
    return new RngImpl(`${this.path}/${name}`)
  }
}

export function createRng(seed: number | string): Rng {
  return new RngImpl(String(seed))
}
