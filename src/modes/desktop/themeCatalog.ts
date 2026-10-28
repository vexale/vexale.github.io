export const DESKTOP_THEMES = [
  { id: 'calm-violet', labelKey: 'calmViolet' },
  { id: 'charcoal', labelKey: 'charcoal' },
  { id: 'midnight-blue', labelKey: 'midnightBlue' },
  { id: 'forest', labelKey: 'forest' },
  { id: 'sand-dark', labelKey: 'sandDark' },
  { id: 'rose-dusk', labelKey: 'roseDusk' },
  { id: 'soft-light', labelKey: 'softLight' },
] as const

export type DesktopTheme = (typeof DESKTOP_THEMES)[number]['id']
export type DesktopThemeLabelKey = (typeof DESKTOP_THEMES)[number]['labelKey']
export const DESKTOP_THEME_IDS: readonly DesktopTheme[] = DESKTOP_THEMES.map(({ id }) => id)
