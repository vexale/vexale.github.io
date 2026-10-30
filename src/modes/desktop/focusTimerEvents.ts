import type { FocusTarget } from './focusStore'

export const FOCUS_TIMER_REQUEST_EVENT = 'vexale:office:focus-timer-request'

export function requestFocusTimer(target: FocusTarget): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<FocusTarget>(FOCUS_TIMER_REQUEST_EVENT, { detail: target }))
}
