import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { PALETTE, findNode } from '../shared'
import type { TNode } from '../shared'
import { isSupabaseConfigured } from '../lib/supabase'
import { getLocalDataOwner, getScopedStorageItem, getScopedStorageKey, setScopedStorageItem, subscribeLocalDataOwner } from '../lib/localData'

/* ============ رموز نظام التصميم المشترك ============ */
export const ACCENT = '#a78bfa'
export const panel = 'ui-panel rounded-xl backdrop-blur-md'
export const btn = 'ui-button-secondary px-3 py-1.5 text-sm transition active:scale-95'
export const field = 'ui-field px-3 py-1.5 text-sm outline-none transition focus-visible:ring-2'

/* ============ توافر خدمة الذكاء الاصطناعي ============ */
// الطلبات تمر عبر Supabase Edge Function؛ لا يُرسل مفتاح Gemini إلى المتصفح.
export const hasAI = (): boolean => isSupabaseConfigured

/* ============ مساعدات الشجرة ============ */
export interface FlatNode { id: string; label: string; ci: number }
export function flattenTree(nodes: TNode[], depth = 0): FlatNode[] {
  return nodes.flatMap(n => [{ id: n.id, label: '— '.repeat(depth) + n.title, ci: n.ci }, ...flattenTree(n.children, depth + 1)])
}
export const colorOf = (ci: number) => PALETTE[ci % PALETTE.length]
// معرّف الفرع وكل فروعه التابعة
export function subtreeIds(tree: TNode[], id: string): string[] {
  const walk = (n: TNode): string[] => [n.id, ...n.children.flatMap(walk)]
  const n = findNode(tree, id)
  return n ? walk(n) : []
}

/* ============ تنزيل ونسخ ============ */
export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => { /* تجاهل */ })

/* ============ حالة محفوظة في localStorage (كتابة مؤجلة 300ms) ============ */
export function usePersisted<T>(key: string, init: T): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try { const r = getScopedStorageItem(key); return r ? (JSON.parse(r) as T) : init } catch { return init }
  })
  const latest = useRef(v)
  useEffect(() => { latest.current = v }, [v])
  useEffect(() => subscribeLocalDataOwner(() => {
    try { const raw = getScopedStorageItem(key); const next = raw ? JSON.parse(raw) as T : init; latest.current = next; setV(next) } catch { latest.current = init; setV(init) }
  }), [key, init])
  useEffect(() => {
    const owner = getLocalDataOwner()
    const timer = setTimeout(() => setScopedStorageItem(key, JSON.stringify(latest.current), owner), 300)
    return () => clearTimeout(timer)
  }, [key, v])
  useEffect(() => {
    const owner = getLocalDataOwner()
    return () => { setScopedStorageItem(key, JSON.stringify(latest.current), owner) }
  }, [key])
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== getScopedStorageKey(key)) return
      try { const raw = getScopedStorageItem(key); const next = raw ? JSON.parse(raw) as T : init; latest.current = next; setV(next) } catch { setV(init) }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, init])
  return [v, setV]
}
