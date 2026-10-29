import { useSyncExternalStore } from 'react'

export type DesktopTheme = 'calm-violet' | 'charcoal' | 'midnight-blue' | 'forest' | 'sand-dark' | 'rose-dusk' | 'soft-light'
export type DesktopFont = 'instrument' | 'noto' | 'system'
export type SidebarPosition = 'auto' | 'right' | 'left'
export type ContentWidth = 'narrow' | 'comfortable' | 'wide'
export type Density = 'comfortable' | 'compact' | 'spacious'

export interface DesktopPreferences {
  theme: DesktopTheme
  accentColor: string | null
  font: DesktopFont
  fontSize: number
  lineHeight: number
  contentWidth: ContentWidth
  density: Density
  reduceMotion: boolean
  sidebarPosition: SidebarPosition
  railCollapsed: boolean
  sectionsCollapsed: boolean
  expandedSectionIds: string[]
}

export const DESKTOP_PREFERENCES_KEY = 'vexale-office-preferences-v1'
const THEME_IDS: readonly DesktopTheme[] = ['calm-violet', 'charcoal', 'midnight-blue', 'forest', 'sand-dark', 'rose-dusk', 'soft-light']
const FONT_IDS: readonly DesktopFont[] = ['instrument', 'noto', 'system']
const CONTENT_WIDTHS: readonly ContentWidth[] = ['narrow', 'comfortable', 'wide']
const DENSITIES: readonly Density[] = ['comfortable', 'compact', 'spacious']
const SIDEBAR_POSITIONS: readonly SidebarPosition[] = ['auto', 'right', 'left']

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  theme: 'calm-violet',
  accentColor: null,
  font: 'instrument',
  fontSize: 16,
  lineHeight: 1.6,
  contentWidth: 'comfortable',
  density: 'comfortable',
  reduceMotion: false,
  sidebarPosition: 'auto',
  railCollapsed: false,
  sectionsCollapsed: false,
  expandedSectionIds: [],
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

function sanitize(value: unknown): DesktopPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...DEFAULT_DESKTOP_PREFERENCES }
  const raw = value as Record<string, unknown>
  const fontSize = typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize) ? Math.max(12, Math.min(20, Math.round(raw.fontSize))) : DEFAULT_DESKTOP_PREFERENCES.fontSize
  const lineHeight = typeof raw.lineHeight === 'number' && Number.isFinite(raw.lineHeight) ? Math.max(1.2, Math.min(2, raw.lineHeight)) : DEFAULT_DESKTOP_PREFERENCES.lineHeight
  return {
    theme: isOneOf(raw.theme, THEME_IDS) ? raw.theme : DEFAULT_DESKTOP_PREFERENCES.theme,
    accentColor: typeof raw.accentColor === 'string' && /^#[\da-f]{6}$/i.test(raw.accentColor) ? raw.accentColor.toLowerCase() : null,
    font: isOneOf(raw.font, FONT_IDS) ? raw.font : DEFAULT_DESKTOP_PREFERENCES.font,
    fontSize,
    lineHeight,
    contentWidth: isOneOf(raw.contentWidth, CONTENT_WIDTHS) ? raw.contentWidth : DEFAULT_DESKTOP_PREFERENCES.contentWidth,
    density: isOneOf(raw.density, DENSITIES) ? raw.density : DEFAULT_DESKTOP_PREFERENCES.density,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : DEFAULT_DESKTOP_PREFERENCES.reduceMotion,
    sidebarPosition: isOneOf(raw.sidebarPosition, SIDEBAR_POSITIONS) ? raw.sidebarPosition : DEFAULT_DESKTOP_PREFERENCES.sidebarPosition,
    railCollapsed: typeof raw.railCollapsed === 'boolean' ? raw.railCollapsed : DEFAULT_DESKTOP_PREFERENCES.railCollapsed,
    sectionsCollapsed: typeof raw.sectionsCollapsed === 'boolean' ? raw.sectionsCollapsed : DEFAULT_DESKTOP_PREFERENCES.sectionsCollapsed,
    expandedSectionIds: Array.isArray(raw.expandedSectionIds) ? raw.expandedSectionIds.filter((id): id is string => typeof id === 'string') : [],
  }
}

function loadPreferences(): DesktopPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_DESKTOP_PREFERENCES }
  try {
    const raw = window.localStorage.getItem(DESKTOP_PREFERENCES_KEY)
    return raw ? sanitize(JSON.parse(raw) as unknown) : { ...DEFAULT_DESKTOP_PREFERENCES }
  } catch {
    return { ...DEFAULT_DESKTOP_PREFERENCES }
  }
}

let preferences = loadPreferences()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getSnapshot = (): DesktopPreferences => preferences

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== DESKTOP_PREFERENCES_KEY) return
    preferences = loadPreferences()
    listeners.forEach(listener => listener())
  })
}

export function useDesktopPreferences(): DesktopPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_DESKTOP_PREFERENCES)
}

export function updateDesktopPreferences(patch: Partial<DesktopPreferences>): void {
  preferences = sanitize({ ...preferences, ...patch })
  try {
    window.localStorage.setItem(DESKTOP_PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // تظل التفضيلات الحالية فعالة في الجلسة عند تعذر التخزين.
  }
  listeners.forEach(listener => listener())
}
