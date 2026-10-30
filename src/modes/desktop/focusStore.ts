import { useSyncExternalStore } from 'react'

export type FocusTargetType = 'task' | 'section'
export type FocusAmbient = 'none' | 'drone' | 'wind' | 'stars'
export interface FocusTarget { type: FocusTargetType; id: string; title: string }
export interface FocusSession { id: string; targetType: FocusTargetType | null; targetId: string | null; targetTitle: string | null; startedAt: number; endedAt: number; durationSeconds: number }
export interface FocusSettings { workMinutes: number; breakMinutes: number; ambient: FocusAmbient; volume: number }

export const FOCUS_SESSIONS_KEY = 'vexale-office-focus-sessions-v1'
export const FOCUS_SETTINGS_KEY = 'vexale-office-focus-settings-v1'
export const DEFAULT_FOCUS_SETTINGS: FocusSettings = { workMinutes: 25, breakMinutes: 5, ambient: 'none', volume: 0.35 }
const EMPTY_SESSIONS: FocusSession[] = []
const listeners = new Set<() => void>()
const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener) }

function validSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && (item.targetType === null || item.targetType === 'task' || item.targetType === 'section') &&
    (item.targetId === null || typeof item.targetId === 'string') && (item.targetTitle === null || typeof item.targetTitle === 'string') &&
    typeof item.startedAt === 'number' && Number.isFinite(item.startedAt) && typeof item.endedAt === 'number' && Number.isFinite(item.endedAt) &&
    typeof item.durationSeconds === 'number' && Number.isFinite(item.durationSeconds) && item.durationSeconds > 0
}
function loadSessions(): FocusSession[] {
  if (typeof window === 'undefined') return EMPTY_SESSIONS
  try { const value: unknown = JSON.parse(localStorage.getItem(FOCUS_SESSIONS_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(validSession).slice(-1000) : [] } catch { return [] }
}
let sessions = loadSessions()
const snapshot = (): FocusSession[] => sessions
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (event.key === FOCUS_SESSIONS_KEY) { sessions = loadSessions(); listeners.forEach(listener => listener()) } })

export function useFocusSessions(): FocusSession[] { return useSyncExternalStore(subscribe, snapshot, () => EMPTY_SESSIONS) }
export function addFocusSession(session: FocusSession): void {
  if (!validSession(session)) return
  sessions = [...sessions, session].slice(-1000)
  try { localStorage.setItem(FOCUS_SESSIONS_KEY, JSON.stringify(sessions)) } catch { /* retain this session in memory if storage is unavailable */ }
  listeners.forEach(listener => listener())
}

export function readFocusSettings(): FocusSettings {
  if (typeof window === 'undefined') return DEFAULT_FOCUS_SETTINGS
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FOCUS_SETTINGS_KEY) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_FOCUS_SETTINGS
    const raw = value as Record<string, unknown>
    return {
      workMinutes: typeof raw.workMinutes === 'number' && Number.isFinite(raw.workMinutes) ? Math.max(1, Math.min(120, Math.round(raw.workMinutes))) : 25,
      breakMinutes: typeof raw.breakMinutes === 'number' && Number.isFinite(raw.breakMinutes) ? Math.max(1, Math.min(60, Math.round(raw.breakMinutes))) : 5,
      ambient: raw.ambient === 'drone' || raw.ambient === 'wind' || raw.ambient === 'stars' ? raw.ambient : 'none',
      volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : 0.35,
    }
  } catch { return DEFAULT_FOCUS_SETTINGS }
}
export function saveFocusSettings(settings: FocusSettings): void {
  const safe: FocusSettings = { workMinutes: Math.max(1, Math.min(120, Math.round(settings.workMinutes))), breakMinutes: Math.max(1, Math.min(60, Math.round(settings.breakMinutes))), ambient: settings.ambient, volume: Math.max(0, Math.min(1, settings.volume)) }
  try { localStorage.setItem(FOCUS_SETTINGS_KEY, JSON.stringify(safe)) } catch { /* keep settings available for this session */ }
}
