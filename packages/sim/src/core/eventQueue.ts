/** Binary min-heap ordered by (time, priority, seq). `seq` makes ordering total and FIFO among equals. */
export interface QueueItem<T> {
  readonly time: number
  readonly priority: number
  readonly seq: number
  readonly payload: T
  cancelled: boolean
}

export class EventQueue<T> {
  private heap: QueueItem<T>[] = []
  private seq = 0
  private live = 0

  get size(): number {
    return this.live
  }

  push(time: number, payload: T, priority = 100): QueueItem<T> {
    const item: QueueItem<T> = { time, priority, seq: this.seq++, payload, cancelled: false }
    this.heap.push(item)
    this.live++
    this.siftUp(this.heap.length - 1)
    return item
  }

  cancel(item: QueueItem<T>): boolean {
    if (item.cancelled) return false
    item.cancelled = true
    this.live--
    return true
  }

  /** Earliest live item without removing it. */
  peek(): QueueItem<T> | undefined {
    this.dropCancelledHead()
    return this.heap[0]
  }

  pop(): QueueItem<T> | undefined {
    this.dropCancelledHead()
    const top = this.heap[0]
    if (!top) return undefined
    const last = this.heap.pop() as QueueItem<T>
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }
    this.live--
    return top
  }

  /** Pops everything with time <= t in order. */
  popDue(t: number): QueueItem<T>[] {
    const out: QueueItem<T>[] = []
    for (;;) {
      const p = this.peek()
      if (!p || p.time > t) break
      out.push(this.pop() as QueueItem<T>)
    }
    return out
  }

  private dropCancelledHead(): void {
    while (this.heap.length > 0 && (this.heap[0] as QueueItem<T>).cancelled) {
      const last = this.heap.pop() as QueueItem<T>
      if (this.heap.length > 0) {
        this.heap[0] = last
        this.siftDown(0)
      }
    }
  }

  private less(a: QueueItem<T>, b: QueueItem<T>): boolean {
    if (a.time !== b.time) return a.time < b.time
    if (a.priority !== b.priority) return a.priority < b.priority
    return a.seq < b.seq
  }

  private siftUp(i0: number): void {
    let i = i0
    const item = this.heap[i] as QueueItem<T>
    while (i > 0) {
      const p = (i - 1) >> 1
      const parent = this.heap[p] as QueueItem<T>
      if (!this.less(item, parent)) break
      this.heap[i] = parent
      i = p
    }
    this.heap[i] = item
  }

  private siftDown(i0: number): void {
    let i = i0
    const n = this.heap.length
    const item = this.heap[i] as QueueItem<T>
    for (;;) {
      const l = 2 * i + 1
      if (l >= n) break
      const r = l + 1
      let c = l
      if (r < n && this.less(this.heap[r] as QueueItem<T>, this.heap[l] as QueueItem<T>)) c = r
      if (!this.less(this.heap[c] as QueueItem<T>, item)) break
      this.heap[i] = this.heap[c] as QueueItem<T>
      i = c
    }
    this.heap[i] = item
  }
}
