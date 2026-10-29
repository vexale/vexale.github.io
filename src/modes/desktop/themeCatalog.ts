export const DESKTOP_THEMES = [
  { id: 'calm-violet', labelKey: 'calmViolet' },
  { id: 'charcoal', labelKey: 'charcoal' },
  { id: 'midnight-blue', labelKey: 'midnightBlue' },
  { id: 'forest', labelKey: 'forest' },
  { id: 'sand-dark', labelKey: 'sandDark' },
  { id: 'rose-dusk', labelKey: 'roseDusk' },
  { id: 'soft-light', labelKey: 'softLight' },
] as const

export const DESKTOP_THEME_COLORS = {
  'calm-violet': ['#15171c', '#1a1c23', '#5b4fe0'],
  charcoal: ['#151515', '#1c1c1c', '#5b4fe0'],
  'midnight-blue': ['#121821', '#18212c', '#5b4fe0'],
  forest: ['#131915', '#1a211c', '#5b4fe0'],
  'sand-dark': ['#1a1814', '#211e19', '#5b4fe0'],
  'rose-dusk': ['#1b171a', '#241f23', '#5b4fe0'],
  'soft-light': ['#f2f1f7', '#e9e8f0', '#5b4fe0'],
} as const

export type DesktopTheme = (typeof DESKTOP_THEMES)[number]['id']
export type DesktopThemeLabelKey = (typeof DESKTOP_THEMES)[number]['labelKey']
export const DESKTOP_THEME_IDS: readonly DesktopTheme[] = DESKTOP_THEMES.map(({ id }) => id)
