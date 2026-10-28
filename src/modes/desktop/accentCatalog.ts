export const ACCENT_CATALOG = [
  { id: 'violet', hex: '#5b4fe0' },
  { id: 'slate', hex: '#475569' },
  { id: 'teal', hex: '#0f665f' },
  { id: 'forest', hex: '#176b4d' },
  { id: 'amber', hex: '#77530c' },
  { id: 'rose', hex: '#8a3f5c' },
  { id: 'coral', hex: '#9b3c2e' },
] as const

export type AccentId = (typeof ACCENT_CATALOG)[number]['id']

function relativeLuminance(hex: string): number | null {
  if (!/^#[\da-f]{6}$/i.test(hex)) return null
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const [red, green, blue] = channels.map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  if (red === undefined || green === undefined || blue === undefined) return null
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function hasAccessibleWhiteContrast(hex: string): boolean {
  const luminance = relativeLuminance(hex)
  return luminance !== null && 1.05 / (luminance + 0.05) >= 4.5
}
