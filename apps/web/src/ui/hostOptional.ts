import { useContext } from 'react'
import { HostContextRef } from '../host/context'

/** useHost that does not throw outside <HostProvider> (design-system components used in isolation / tests). */
export function useHostOptional() {
  const c = useContext(HostContextRef)
  return c
}
