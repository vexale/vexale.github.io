import { supabase } from './supabase'

export type LocalDataOwner = 'guest' | `acct:${string}`
type OwnerListener = () => void

export interface LocalTombstone {
  kind: string
  id: string
  updatedAt: number
  deleted: true
}

export interface ScopedLocalRecord {
  key: string
  value: string
  updatedAt: number
  deleted: boolean
  ownerId: LocalDataOwner
}

interface StoredEnvelope {
  __vexaleLocalRecord: 1
  ownerId: LocalDataOwner
  value: string
  updatedAt: number
  deleted: boolean
}

const PREFIX = 'vexale:local:v1'
let owner: LocalDataOwner = 'guest'
let authEventSeen = false
const listeners = new Set<OwnerListener>()

function isDeviceOnlyKey(key: string): boolean {
  return key.startsWith('sb-') || key === 'atelier-google-auth-v1' || key === 'atelier-shared-workspace-v1' ||
    key === 'vexale-locale-v1' || key === 'vexale-workspace-mode-v1' || key === 'vexale-workspace-setup-v1' ||
    key === 'vexale-anonymous-analytics' || key === 'vexale-last-backup-v1' || key.startsWith('vexale-tour-')
}

export function getScopedStorageKey(key: string, dataOwner: LocalDataOwner = owner): string {
  return `${PREFIX}:${encodeURIComponent(dataOwner)}:${key}`
}

function parseEnvelope(raw: string, dataOwner: LocalDataOwner): StoredEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const candidate = parsed as Record<string, unknown>
      if (candidate.__vexaleLocalRecord === 1 && candidate.ownerId === dataOwner && typeof candidate.value === 'string' && typeof candidate.updatedAt === 'number' && typeof candidate.deleted === 'boolean') return candidate as unknown as StoredEnvelope
    }
  } catch { /* القيمة الخام قد تكون بيانات قديمة قبل التغليف */ }
  return null
}

function readForOwner(key: string, dataOwner: LocalDataOwner): { value: string; updatedAt: number; deleted: boolean } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getScopedStorageKey(key, dataOwner))
    if (raw === null) return null
    const envelope = parseEnvelope(raw, dataOwner)
    if (envelope) return { value: envelope.value, updatedAt: envelope.updatedAt, deleted: envelope.deleted }
    return { value: raw, updatedAt: Date.now(), deleted: false }
  } catch { return null }
}

export function setScopedStorageItem(key: string, value: string, dataOwner: LocalDataOwner = owner): boolean {
  if (typeof window === 'undefined') return false
  try {
    const envelope: StoredEnvelope = { __vexaleLocalRecord: 1, ownerId: dataOwner, value, updatedAt: Date.now(), deleted: false }
    window.localStorage.setItem(getScopedStorageKey(key, dataOwner), JSON.stringify(envelope))
    return true
  } catch { return false }
}

function getScopedStorageItemForOwner(key: string, dataOwner: LocalDataOwner): string | null {
  const record = readForOwner(key, dataOwner)
  return record && !record.deleted ? record.value : null
}

export function getScopedStorageItem(key: string, dataOwner: LocalDataOwner = owner): string | null {
  const current = readForOwner(key, dataOwner)
  if (current) {
    if (!current.deleted && typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(getScopedStorageKey(key, dataOwner))
      if (raw !== null && !parseEnvelope(raw, dataOwner)) setScopedStorageItem(key, current.value, dataOwner)
    }
    return current.deleted ? null : current.value
  }
  if (dataOwner !== 'guest' || typeof window === 'undefined') return null
  try {
    const legacy = window.localStorage.getItem(key)
    if (legacy === null) return null
    const copied = setScopedStorageItem(key, legacy, 'guest')
    if (copied && getScopedStorageItemForOwner(key, 'guest') === legacy) window.localStorage.removeItem(key)
    return legacy
  } catch { return null }
}

export function removeScopedStorageItem(key: string): void {
  if (typeof window === 'undefined') return
  try {
    const envelope: StoredEnvelope = { __vexaleLocalRecord: 1, ownerId: owner, value: '', updatedAt: Date.now(), deleted: true }
    window.localStorage.setItem(getScopedStorageKey(key), JSON.stringify(envelope))
  } catch { /* تجاهل تعذّر التخزين */ }
}

function migrateLegacyLocalData(): void {
  if (typeof window === 'undefined') return
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => Boolean(key))
    for (const key of keys) {
      if (isDeviceOnlyKey(key) || (!key.startsWith('atelier-') && !key.startsWith('vexale-'))) continue
      if (getScopedStorageItemForOwner(key, 'guest') !== null) continue
      const value = window.localStorage.getItem(key)
      if (value === null) continue
      const copied = setScopedStorageItem(key, value, 'guest')
      if (copied && getScopedStorageItemForOwner(key, 'guest') === value) window.localStorage.removeItem(key)
    }
  } catch { /* تبقى البيانات القديمة دون تغيير عند تعذّر التخزين */ }
}

migrateLegacyLocalData()

function ownerFromUserId(userId: string | undefined): LocalDataOwner {
  return userId ? `acct:${userId}` : 'guest'
}

function setOwner(next: LocalDataOwner): void {
  if (owner === next) return
  owner = next
  listeners.forEach(listener => listener())
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    authEventSeen = true
    setOwner(ownerFromUserId(session?.user.id))
  })
  void supabase.auth.getSession().then(({ data }) => {
    if (!authEventSeen) setOwner(ownerFromUserId(data.session?.user.id))
  }).catch(() => undefined)
}

export function getLocalDataOwner(): LocalDataOwner {
  return owner
}

export function getScopedLocalRecords(dataOwner: LocalDataOwner = owner): ScopedLocalRecord[] {
  if (typeof window === 'undefined') return []
  const prefix = `${PREFIX}:${encodeURIComponent(dataOwner)}:`
  const records: ScopedLocalRecord[] = []
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index)
      if (!storageKey?.startsWith(prefix)) continue
      const key = storageKey.slice(prefix.length)
      const raw = window.localStorage.getItem(storageKey)
      if (raw === null) continue
      const envelope = parseEnvelope(raw, dataOwner)
      records.push({ key, value: envelope?.value ?? raw, updatedAt: envelope?.updatedAt ?? Date.now(), deleted: envelope?.deleted ?? false, ownerId: dataOwner })
    }
  } catch { return records }
  return records
}

export function clearCurrentLocalStorageData(dataOwner: LocalDataOwner = owner): void {
  if (typeof window === 'undefined') return
  const prefix = `${PREFIX}:${encodeURIComponent(dataOwner)}:`
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith(prefix)))
    keys.forEach(key => window.localStorage.removeItem(key))
    if (dataOwner === 'guest') {
      const legacyKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => Boolean(key && (key.startsWith('atelier-') || key.startsWith('vexale-')) && !isDeviceOnlyKey(key)))
      legacyKeys.forEach(key => window.localStorage.removeItem(key))
    }
  } catch { /* تبقى البيانات سليمة إذا رفض المتصفح حذفها */ }
}

export function recordLocalTombstones(kind: string, ids: string[], updatedAt = Date.now(), dataOwner: LocalDataOwner = owner): void {
  if (!ids.length) return
  const key = 'vexale-sync-tombstones-v1'
  let records: LocalTombstone[] = []
  try {
    const parsed: unknown = JSON.parse(getScopedStorageItemForOwner(key, dataOwner) ?? '[]')
    if (Array.isArray(parsed)) records = parsed.filter((item): item is LocalTombstone => Boolean(item && typeof item === 'object' && typeof item.kind === 'string' && typeof item.id === 'string' && typeof item.updatedAt === 'number' && item.deleted === true))
  } catch { records = [] }
  const nextByKey = new Map(records.map(record => [`${record.kind}\u0000${record.id}`, record]))
  ids.forEach(id => nextByKey.set(`${kind}\u0000${id}`, { kind, id, updatedAt, deleted: true }))
  setScopedStorageItem(key, JSON.stringify([...nextByKey.values()]), dataOwner)
}

export function getLocalTombstones(dataOwner: LocalDataOwner = owner): LocalTombstone[] {
  try {
    const parsed: unknown = JSON.parse(getScopedStorageItemForOwner('vexale-sync-tombstones-v1', dataOwner) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((item): item is LocalTombstone => Boolean(item && typeof item === 'object' && typeof item.kind === 'string' && typeof item.id === 'string' && typeof item.updatedAt === 'number' && item.deleted === true))
      : []
  } catch { return [] }
}

export function clearLocalTombstones(kind: string, ids: string[], dataOwner: LocalDataOwner = owner): void {
  if (!ids.length) return
  const removed = new Set(ids)
  const next = getLocalTombstones(dataOwner).filter(record => record.kind !== kind || !removed.has(record.id))
  setScopedStorageItem('vexale-sync-tombstones-v1', JSON.stringify(next), dataOwner)
}

export function subscribeLocalDataOwner(listener: OwnerListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
