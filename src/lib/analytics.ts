export const ANALYTICS_CONSENT_KEY = 'vexale-anonymous-analytics'
export const ANALYTICS_SESSION_ID_KEY = 'vexale-anonymous-session-v1'

export type AnalyticsEvent =
  | 'app_open'
  | 'onboarding_done'
  | 'section_created'
  | 'note_edited'
  | 'task_created'
  | 'task_completed'
  | 'tool_opened'
  | 'focus_session_done'
  | 'export_done'
  | 'theme_changed'
  | 'mode_switched'

export interface AnalyticsProvider {
  capture(event: AnalyticsEvent, anonymousSessionId: string): void
}

let memoryConsent: boolean | null = null
let memorySessionId = ''

function storedConsent(): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'true' } catch { return false }
}

export function isAnalyticsEnabled(): boolean {
  return memoryConsent ?? storedConsent()
}

export function setAnalyticsConsent(enabled: boolean): void {
  let persisted = false
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, String(enabled))
      persisted = true
    } catch { /* Keep the choice only for this page session when storage is blocked. */ }
  }
  memoryConsent = persisted ? null : enabled
  if (!enabled) {
    memorySessionId = ''
    try { window.sessionStorage.removeItem(ANALYTICS_SESSION_ID_KEY) } catch { /* No persistent identifier is used. */ }
  }
}

function makeSessionId(): string {
  try { return `vexale-${crypto.randomUUID()}` } catch { return `vexale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
}

function getSessionId(): string {
  if (memorySessionId) return memorySessionId
  if (typeof window !== 'undefined') {
    try {
      const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY)
      if (existing) return memorySessionId = existing
      memorySessionId = makeSessionId()
      window.sessionStorage.setItem(ANALYTICS_SESSION_ID_KEY, memorySessionId)
      return memorySessionId
    } catch { /* Fall back to an in-memory ID; never persist it to localStorage. */ }
  }
  return memorySessionId = makeSessionId()
}

const posthogProvider: AnalyticsProvider = {
  capture(event, anonymousSessionId) {
    const apiKey = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
    const host = (import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com').trim().replace(/\/+$/, '')
    if (!apiKey || !/^https:\/\//i.test(host) || typeof fetch !== 'function') return

    const body = JSON.stringify({
      api_key: apiKey,
      event,
      distinct_id: anonymousSessionId,
      timestamp: new Date().toISOString(),
      properties: {},
      ip: 0,
    })
    try {
      void fetch(`${host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined)
    } catch { /* Analytics must never interrupt application actions. */ }
  },
}

let provider: AnalyticsProvider = posthogProvider

export function configureAnalyticsProvider(nextProvider: AnalyticsProvider): void {
  provider = nextProvider
}

export function trackAnalytics(event: AnalyticsEvent): void {
  if (!isAnalyticsEnabled()) return
  try { provider.capture(event, getSessionId()) } catch { /* Analytics failures are intentionally non-blocking. */ }
}
