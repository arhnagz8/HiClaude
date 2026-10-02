import { createContext } from 'react'
import type { MessengerHost } from './types'
import type { SimHost } from './simulated'

export interface HostCtx {
  host: MessengerHost
  sim?: SimHost
  /** '' | '/tg' | '/bale' — prefix for every in-app link */
  base: '' | '/tg' | '/bale'
}
export const HostContextRef = createContext<HostCtx | null>(null)
