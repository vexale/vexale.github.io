import { useCallback, useEffect, useState } from 'react'
import { getScopedStorageItem, setScopedStorageItem, subscribeLocalDataOwner } from './localData'

/* ============ إعدادات المظهر المحفوظة (الخلفية حية أم ثابتة) ============ */
export type BgMode = 'live' | 'static'
export interface Appearance { bg: BgMode }

const KEY = 'atelier-appearance-v1'

function load(): Appearance {
  try {
    const raw = getScopedStorageItem(KEY)
    const p = raw ? (JSON.parse(raw) as Partial<Appearance>) : null
    if (p && (p.bg === 'live' || p.bg === 'static')) return { bg: p.bg }
  } catch { /* تجاهل: قيمة تالفة */ }
  // الافتراضي: ثابتة لمن يفضّل تقليل الحركة في نظامه، وحيّة لغيره
  const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return { bg: calm ? 'static' : 'live' }
}

export function useAppearance(): [Appearance, (patch: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState<Appearance>(load)
  useEffect(() => subscribeLocalDataOwner(() => setAppearance(load())), [])
  const update = useCallback((patch: Partial<Appearance>) => {
    setAppearance(prev => {
      const next = { ...prev, ...patch }
      setScopedStorageItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])
  return [appearance, update]
}
