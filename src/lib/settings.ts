import { useSyncExternalStore } from 'react'

export type ThemeId = 'space-live' | 'wave-field' | 'orbit-drift' | 'liquid-velvet' | 'pastel-waves' | 'botanical-flow' | 'rose-nebula' | 'moonlit-bloom' | 'cyber-grid' | 'geometric-matrix' | 'tech-pulse' | 'nova-drive' | 'star-forge' | 'space-static' | 'solid' | 'cats' | 'floral' | 'butterflies' | 'dark-vintage' | 'pastel-ai'
export type WindowStyle = 'glass' | 'solid'
export type ViewMode = 'focus' | 'compact' | 'single-section'
export type AnimationMode = 'mouse' | 'auto'
export type AccentMode = 'auto' | 'custom'
export type AiPersonality = 'short' | 'educational' | 'detailed' | 'creative'
export type ThemePalette = [string, string, string, string, string]

export interface Settings {
  theme: ThemeId
  animationMode: AnimationMode
  windowStyle: WindowStyle
  viewMode: ViewMode
  glassOpacity: number
  accentMode: AccentMode
  customAccent: string
  hiddenTools: string[]
  aiPersonality: AiPersonality
  pastelPalette: ThemePalette
}

export const SETTINGS_KEY = 'atelier-settings-v1'
const LEGACY_APPEARANCE_KEY = 'atelier-appearance-v1'
export const TRASH_RETENTION_DAYS = 30

const THEME_IDS: readonly ThemeId[] = ['space-live', 'wave-field', 'orbit-drift', 'liquid-velvet', 'pastel-waves', 'botanical-flow', 'rose-nebula', 'moonlit-bloom', 'cyber-grid', 'geometric-matrix', 'tech-pulse', 'nova-drive', 'star-forge', 'space-static', 'solid', 'cats', 'floral', 'butterflies', 'dark-vintage', 'pastel-ai']
const WINDOW_STYLES: readonly WindowStyle[] = ['glass', 'solid']
const VIEW_MODES: readonly ViewMode[] = ['focus', 'compact', 'single-section']
const ANIMATION_MODES: readonly AnimationMode[] = ['mouse', 'auto']
const ACCENT_MODES: readonly AccentMode[] = ['auto', 'custom']
const AI_IDS: readonly AiPersonality[] = ['short', 'educational', 'detailed', 'creative']
export const ANIMATED_THEME_IDS = ['space-live', 'wave-field', 'orbit-drift', 'liquid-velvet', 'pastel-waves', 'botanical-flow', 'rose-nebula', 'moonlit-bloom', 'cyber-grid', 'geometric-matrix', 'tech-pulse', 'nova-drive', 'star-forge'] as const
export type AnimatedThemeId = typeof ANIMATED_THEME_IDS[number]
export const RANDOMIZABLE_THEMES: readonly ThemeId[] = ANIMATED_THEME_IDS
export const isAnimatedTheme = (theme: ThemeId): theme is AnimatedThemeId => (ANIMATED_THEME_IDS as readonly ThemeId[]).includes(theme)
export const DEFAULT_PASTEL_PALETTE: ThemePalette = ['#17152a', '#28213b', '#d9b8ff', '#ffd7e8', '#fff7fc']

export const TOOL_CATALOG: readonly { id: string; label: string }[] = [
  { id: 'calc', label: 'Calculator' },
  { id: 'notes', label: 'Quick notes' },
  { id: 'plot', label: 'Coordinates' },
  { id: 'chat', label: 'Library chat' },
  { id: 'math', label: 'Math solver' },
  { id: 'code', label: 'Code playground' },
  { id: 'quiz', label: 'Quizzes & cards' },
  { id: 'data', label: 'Data analysis' },
  { id: 'board', label: 'Canvas & maps' },
  { id: 'docs', label: 'Document tools' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'audio', label: 'Focus & audio' },
]

export const ACCENT_PRESETS: readonly string[] = [
  '#a78bfa', '#67e8f9', '#f9a8d4', '#fcd34d', '#86efac', '#fdba74', '#93c5fd', '#f87171',
]

export const AI_PERSONALITIES: readonly { id: AiPersonality; label: string; hint: string; instruction: string }[] = [
  { id: 'short', label: 'Concise', hint: 'Short, direct answers', instruction: 'Answer directly in two or three sentences.' },
  { id: 'educational', label: 'Educational', hint: 'Clear steps with a brief example', instruction: 'Explain in simple steps and add a short example when useful.' },
  { id: 'detailed', label: 'Detailed', hint: 'Thorough reasoning and edge cases', instruction: 'Give a thorough answer with reasoning, details, and relevant edge cases.' },
  { id: 'creative', label: 'Creative', hint: 'Fresh angles and helpful analogies', instruction: 'Use thoughtful analogies and fresh ideas while staying accurate.' },
]

export function aiInstruction(personality: AiPersonality): string {
  return AI_PERSONALITIES.find(item => item.id === personality)?.instruction ?? ''
}

function defaults(): Settings {
  const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return {
    theme: calm ? 'space-static' : 'space-live',
    animationMode: 'mouse',
    windowStyle: 'glass',
    viewMode: 'focus',
    glassOpacity: 0.82,
    accentMode: 'auto',
    customAccent: '#a78bfa',
    hiddenTools: [],
    aiPersonality: 'educational',
    pastelPalette: [...DEFAULT_PASTEL_PALETTE],
  }
}

const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function sanitize(raw: unknown, base: Settings): Settings {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const knownTools = new Set(TOOL_CATALOG.map(tool => tool.id))
  const hiddenTools = Array.isArray(record.hiddenTools)
    ? [...new Set(record.hiddenTools.filter((item): item is string => typeof item === 'string' && knownTools.has(item)))]
    : base.hiddenTools
  const glassOpacity = typeof record.glassOpacity === 'number' && Number.isFinite(record.glassOpacity)
    ? Math.min(0.98, Math.max(0.3, record.glassOpacity))
    : base.glassOpacity
  const pastelPalette = Array.isArray(record.pastelPalette) && record.pastelPalette.length === 5 && record.pastelPalette.every(isHex)
    ? record.pastelPalette as ThemePalette
    : base.pastelPalette

  return {
    theme: pick(record.theme, THEME_IDS, base.theme),
    animationMode: pick(record.animationMode, ANIMATION_MODES, base.animationMode),
    windowStyle: pick(record.windowStyle, WINDOW_STYLES, base.windowStyle),
    viewMode: pick(record.viewMode, VIEW_MODES, base.viewMode),
    glassOpacity,
    accentMode: pick(record.accentMode, ACCENT_MODES, base.accentMode),
    customAccent: isHex(record.customAccent) ? record.customAccent : base.customAccent,
    hiddenTools,
    aiPersonality: pick(record.aiPersonality, AI_IDS, base.aiPersonality),
    pastelPalette: [...pastelPalette],
  }
}

function load(): Settings {
  const base = defaults()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return sanitize(JSON.parse(raw), base)
    const legacy = localStorage.getItem(LEGACY_APPEARANCE_KEY)
    if (legacy) {
      const appearance = JSON.parse(legacy) as { bg?: unknown }
      if (appearance.bg === 'live') return { ...base, theme: 'space-live' }
      if (appearance.bg === 'static') return { ...base, theme: 'space-static' }
    }
  } catch {
    // تعود الإعدادات الآمنة الافتراضية عند تلف التخزين.
  }
  return base
}

function persist(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // تبقى الإعدادات الحالية فعالة في الجلسة.
  }
}

const STYLE_ID = 'atelier-settings-style'

function apply(settings: Settings): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = 'html[data-win-style="solid"] .glass-strong{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'
    document.head.appendChild(style)
  }
  root.dataset.winStyle = settings.windowStyle
  root.dataset.theme = settings.theme
  root.style.setProperty('--glass-bg-strong', settings.windowStyle === 'solid' ? 'rgb(14, 16, 30)' : `rgba(12, 14, 26, ${settings.glassOpacity})`)
  root.style.setProperty('--pastel-background', settings.pastelPalette[0])
  root.style.setProperty('--pastel-surface', settings.pastelPalette[1])
  root.style.setProperty('--pastel-accent', settings.pastelPalette[2])
  root.style.setProperty('--pastel-secondary', settings.pastelPalette[3])
  root.style.setProperty('--pastel-text', settings.pastelPalette[4])
}

let state: Settings = load()
const listeners = new Set<() => void>()
const emit = (): void => { listeners.forEach(listener => listener()) }
apply(state)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== SETTINGS_KEY) return
    state = load()
    apply(state)
    emit()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSettings(): Settings { return state }

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings)
}

export function updateSettings(patch: Partial<Settings>): void {
  state = sanitize({ ...state, ...patch }, state)
  persist(state)
  apply(state)
  emit()
}

export function resetSettings(): void {
  state = defaults()
  persist(state)
  apply(state)
  emit()
}

export function toggleToolVisibility(id: string): void {
  const hiddenTools = state.hiddenTools.includes(id)
    ? state.hiddenTools.filter(item => item !== id)
    : [...state.hiddenTools, id]
  updateSettings({ hiddenTools })
}

const THEME_ACCENTS: Partial<Record<ThemeId, string>> = {
  'wave-field': '#67e8f9',
  'orbit-drift': '#c4b5fd',
  'liquid-velvet': '#e9a8cf',
  'pastel-waves': '#b7b5ff',
  'botanical-flow': '#9ed9b2',
  'rose-nebula': '#f3a0cb',
  'moonlit-bloom': '#c5c4ff',
  'cyber-grid': '#4deeea',
  'geometric-matrix': '#67e8a5',
  'tech-pulse': '#f2aa47',
  'nova-drive': '#ff835e',
  'star-forge': '#9ec9ff',
  cats: '#f8a978',
  floral: '#f0a7c6',
  butterflies: '#a9b6ff',
  'dark-vintage': '#c8a66a',
}

export function resolveAccent(settings: Settings, branchAccent: string): string {
  if (settings.accentMode === 'custom') return settings.customAccent
  if (settings.theme === 'pastel-ai') return settings.pastelPalette[2]
  return THEME_ACCENTS[settings.theme] ?? branchAccent
}

export function readableOn(hex: string): '#111' | '#fff' {
  if (!isHex(hex)) return '#111'
  const value = Number.parseInt(hex.slice(1), 16)
  const luminance = 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)
  return luminance > 150 ? '#111' : '#fff'
}
