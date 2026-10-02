/**
 * Secure reveal state machine (cards / voucher codes). Secrets live only in this reducer's state while visible:
 * masked → (otp step-up) → loading → visible (auto-hides after AUTO_HIDE_MS) → hidden. Hiding drops the secret from memory.
 */
import type { RevealDto } from '@hiclaude/contracts'

export const AUTO_HIDE_MS = 45_000

export type RevealState =
  | { phase: 'masked' }
  | { phase: 'otp' }
  | { phase: 'loading' }
  | { phase: 'visible'; data: RevealDto; hideAt: number }
  | { phase: 'hidden'; reason: 'timer' | 'manual' | 'expired'; remainingReveals: number }
  | { phase: 'error'; message: string }

export type RevealAction =
  | { type: 'start' } // user pressed «نمایش»
  | { type: 'submit' } // OTP submitted
  | { type: 'success'; data: RevealDto; now: number }
  | { type: 'failure'; message: string }
  | { type: 'hide'; reason?: 'manual' | 'timer' }
  | { type: 'tick'; now: number }
  | { type: 'cancel' }

export const initialReveal: RevealState = { phase: 'masked' }

export function reduceReveal(s: RevealState, a: RevealAction): RevealState {
  switch (a.type) {
    case 'start':
      return s.phase === 'masked' || s.phase === 'hidden' || s.phase === 'error' ? { phase: 'otp' } : s
    case 'cancel':
      return s.phase === 'otp' || s.phase === 'loading' || s.phase === 'error' ? { phase: 'masked' } : s
    case 'submit':
      return s.phase === 'otp' || s.phase === 'error' ? { phase: 'loading' } : s
    case 'success':
      return { phase: 'visible', data: a.data, hideAt: Math.min(a.now + AUTO_HIDE_MS, a.data.expiresAt) }
    case 'failure':
      return { phase: 'error', message: a.message }
    case 'hide':
      return s.phase === 'visible' ? { phase: 'hidden', reason: a.reason ?? 'manual', remainingReveals: s.data.remainingReveals } : s
    case 'tick':
      return s.phase === 'visible' && a.now >= s.hideAt ? { phase: 'hidden', reason: a.now >= s.data.expiresAt ? 'expired' : 'timer', remainingReveals: s.data.remainingReveals } : s
  }
}

export const revealSecondsLeft = (s: RevealState, now: number): number => (s.phase === 'visible' ? Math.max(0, Math.ceil((s.hideAt - now) / 1000)) : 0)
