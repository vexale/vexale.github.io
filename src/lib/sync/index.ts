import { dbApplySyncRecord, dbGetSyncRecords } from '../../db'
import type { DbSyncRecord } from '../../db'
import { supabase } from '../supabase'
import { applyScopedRecord, getLocalDataOwner, getLocalTombstones, getSyncDeviceId, getScopedLocalRecords, mergeGuestNamespaceInto, setScopedStorageItem, subscribeLocalChanges, subscribeLocalDataOwner } from '../localData'
import type { LocalDataOwner, ScopedLocalRecord } from '../localData'
import { mergeRecordSets, mergeSyncRecords } from './merge'
import type { SyncRecord } from './merge'

interface RemoteRow { kind: string; id: string; data: unknown; updated_at: number; deleted: boolean; device_id: string }
interface OutboxEntry extends SyncRecord { ownerId: LocalDataOwner; queuedAt: number; attempts: number }
const OUTBOX_DB = 'vexale-sync-outbox-v1'
const OUTBOX_STORE = 'records'
const DEVICE_META_KEY = 'vexale-sync-record-devices-v1'
const PAGE_SIZE = 250
let running = false
let retryTimer: ReturnType<typeof setTimeout> | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let retryAttempt = 0

function deviceMetadata(): Record<string, { updatedAt: number; deviceId: string }> {
  try { return JSON.parse(localStorage.getItem(DEVICE_META_KEY) ?? '{}') as Record<string, { updatedAt: number; deviceId: string }> } catch { return {} }
}
function recordDeviceId(owner: LocalDataOwner, kind: string, id: string, updatedAt: number): string {
  const key = `${owner}\u0000${kind}\u0000${id}`
  const metadata = deviceMetadata()
  if (metadata[key]?.updatedAt === updatedAt) return metadata[key].deviceId
  metadata[key] = { updatedAt, deviceId: getSyncDeviceId() }
  try { localStorage.setItem(DEVICE_META_KEY, JSON.stringify(metadata)) } catch { /* Metadata is an optimization; local records remain durable. */ }
  return getSyncDeviceId()
}
function rememberRecordDevice(owner: LocalDataOwner, record: SyncRecord): void {
  const metadata = deviceMetadata()
  metadata[`${owner}\u0000${record.kind}\u0000${record.id}`] = { updatedAt: record.updatedAt, deviceId: record.deviceId }
  try { localStorage.setItem(DEVICE_META_KEY, JSON.stringify(metadata)) } catch { /* The next sync can retry. */ }
}

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(OUTBOX_STORE)) request.result.createObjectStore(OUTBOX_STORE, { keyPath: 'key' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open sync outbox'))
  })
}
async function queue(records: SyncRecord[], ownerId: LocalDataOwner = getLocalDataOwner()): Promise<void> {
  if (!records.length || typeof indexedDB === 'undefined') return
  const db = await openOutbox()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    const store = tx.objectStore(OUTBOX_STORE)
    for (const record of records) {
      const key = `${ownerId}\u0000${record.kind}\u0000${record.id}`
      const request = store.get(key)
      request.onsuccess = () => {
        const old = request.result as (OutboxEntry & { key: string }) | undefined
        const winner = mergeSyncRecords(old, record)
        store.put({ ...winner, ownerId, key, queuedAt: old?.queuedAt ?? Date.now(), attempts: old?.attempts ?? 0 })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not persist sync outbox'))
  })
  db.close()
}
async function getOutbox(ownerId: LocalDataOwner): Promise<(OutboxEntry & { key: string })[]> {
  const db = await openOutbox()
  const records = await new Promise<(OutboxEntry & { key: string })[]>((resolve, reject) => {
    const request = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll()
    request.onsuccess = () => resolve((request.result as (OutboxEntry & { key: string })[]).filter(entry => entry.ownerId === ownerId))
    request.onerror = () => reject(request.error)
  })
  db.close()
  return records
}
async function removeOutbox(keys: string[]): Promise<void> {
  if (!keys.length) return
  const db = await openOutbox()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    keys.forEach(key => tx.objectStore(OUTBOX_STORE).delete(key))
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
  db.close()
}

async function encodeFileData(data: unknown): Promise<unknown> {
  if (!data || typeof data !== 'object') return data
  const value = data as Record<string, unknown>
  if (!(value.file instanceof Blob)) return data
  const bytes = new Uint8Array(await value.file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return { ...value, file: { __blob: btoa(binary), type: value.file.type, name: value.file instanceof File ? value.file.name : '' } }
}
function decodeFileData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const value = data as Record<string, unknown>
  const stored = value.file as { __blob?: string; type?: string; name?: string } | undefined
  if (!stored?.__blob) return data
  const bytes = Uint8Array.from(atob(stored.__blob), char => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: stored.type ?? '' })
  return { ...value, file: stored.name ? new File([blob], stored.name, { type: blob.type }) : blob }
}
function ownerLocalRecords(owner: LocalDataOwner): SyncRecord[] {
  const result: SyncRecord[] = getScopedLocalRecords(owner).map((r: ScopedLocalRecord) => ({ kind: 'local', id: r.key, data: r.value, updatedAt: r.updatedAt, deleted: r.deleted, deviceId: recordDeviceId(owner, 'local', r.key, r.updatedAt) }))
  for (const tombstone of getLocalTombstones(owner)) result.push({ kind: tombstone.kind, id: tombstone.id, data: null, updatedAt: tombstone.updatedAt, deleted: true, deviceId: recordDeviceId(owner, tombstone.kind, tombstone.id, tombstone.updatedAt) })
  return result
}
async function collectOwner(owner: LocalDataOwner): Promise<SyncRecord[]> {
  const local = ownerLocalRecords(owner)
  const dbRecords = await dbGetSyncRecords(owner)
  const records: SyncRecord[] = [...local]
  for (const record of dbRecords) records.push({ ...record, data: await encodeFileData(record.data), deviceId: recordDeviceId(owner, record.kind, record.id, record.updatedAt) })
  return records
}
async function applyRecord(record: SyncRecord, owner: LocalDataOwner): Promise<void> {
  rememberRecordDevice(owner, record)
  if (record.kind === 'local') {
    applyScopedRecord({ key: record.id, value: typeof record.data === 'string' ? record.data : JSON.stringify(record.data), updatedAt: record.updatedAt, deleted: record.deleted, ownerId: owner }, owner)
    return
  }
  if (record.kind === 'files' || record.kind === 'notes' || record.kind === 'ocr') {
    await dbApplySyncRecord({ kind: record.kind, id: record.id, data: decodeFileData(record.data), updatedAt: record.updatedAt, deleted: record.deleted } as DbSyncRecord, owner)
    return
  }
  const tombstones = getLocalTombstones(owner).filter(item => item.kind !== record.kind || item.id !== record.id)
  if (record.deleted) tombstones.push({ kind: record.kind, id: record.id, updatedAt: record.updatedAt, deleted: true })
  setScopedStorageItem('vexale-sync-tombstones-v1', JSON.stringify(tombstones), owner)
}
async function pull(owner: LocalDataOwner): Promise<void> {
  if (!supabase) return
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.from('sync_items').select('kind,id,data,updated_at,deleted,device_id').order('updated_at').order('id').range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as RemoteRow[]
    if (!rows.length) return
    const remote = rows.map(row => ({ kind: row.kind, id: row.id, data: row.data, updatedAt: Number(row.updated_at), deleted: row.deleted, deviceId: row.device_id }))
    const local = await collectOwner(owner)
    const localByKey = new Map(local.map(record => [`${record.kind}\u0000${record.id}`, record]))
    for (const incoming of remote) {
      const current = localByKey.get(`${incoming.kind}\u0000${incoming.id}`)
      const winner = mergeSyncRecords(current, incoming)
      if (winner === incoming) await applyRecord(incoming, owner)
      else await queue([winner], owner)
    }
    if (rows.length < PAGE_SIZE) return
    offset += rows.length
  }
}
async function push(): Promise<void> {
  if (!supabase || running || !navigator.onLine || !getLocalDataOwner().startsWith('acct:')) return
  running = true
  try {
    const owner = getLocalDataOwner()
    const entries = await getOutbox(owner)
    for (let index = 0; index < entries.length; index += PAGE_SIZE) {
      if (getLocalDataOwner() !== owner) return
      const batch = entries.slice(index, index + PAGE_SIZE)
      const { error } = await supabase.from('sync_items').upsert(batch.map(({ kind, id, data, updatedAt, deleted, deviceId }) => ({ kind, id, data, updated_at: updatedAt, deleted, device_id: deviceId })), { onConflict: 'user_id,kind,id' })
      if (error) throw error
      await removeOutbox(batch.map(entry => entry.key))
    }
    retryAttempt = 0
  } catch {
    retryAttempt += 1
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(retryAttempt, 6)) + Math.random() * 500
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => { void push() }, delay)
  } finally { running = false }
}
async function syncNow(): Promise<void> {
  const owner = getLocalDataOwner()
  if (!owner.startsWith('acct:') || !navigator.onLine || document.visibilityState === 'hidden') return
  try {
    await pull(owner)
    await queue(await collectOwner(owner), owner)
    await push()
  } catch {
    retryAttempt += 1
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => { void syncNow() }, Math.min(60_000, 1000 * 2 ** Math.min(retryAttempt, 6)) + Math.random() * 500)
  }
}
function schedulePush(): void {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void (async () => { const owner = getLocalDataOwner(); if (owner === 'guest') return; await queue(await collectOwner(owner), owner); await push() })()
  }, 2000)
}

let initialized = false
export function initializeSync(): void {
  if (initialized || typeof window === 'undefined' || !supabase) return
  initialized = true
  const activate = async (owner: LocalDataOwner): Promise<void> => {
    if (!owner.startsWith('acct:')) return
    const mergeMarker = 'vexale-sync-guest-merged-v1'
    const firstAccount = window.localStorage.getItem(mergeMarker) === null
    let records = await collectOwner(owner)
    if (firstAccount) {
      mergeGuestNamespaceInto(owner)
      const guestRecords = await collectOwner('guest')
      records = mergeRecordSets(records, guestRecords)
      for (const record of records) await applyRecord(record, owner)
      try { window.localStorage.setItem(mergeMarker, owner) } catch { /* Repeat the idempotent union on the next session. */ }
    }
    await queue(records, owner)
    void syncNow()
  }
  const unsubscribeOwner = subscribeLocalDataOwner(() => { void activate(getLocalDataOwner()) })
  const unsubscribeChanges = subscribeLocalChanges(schedulePush)
  supabase.auth.getSession().then(({ data }) => { if (data.session?.user.id) void activate(`acct:${data.session.user.id}`) }).catch(() => undefined)
  supabase.auth.onAuthStateChange((_event, session) => { if (session?.user.id) void activate(`acct:${session.user.id}`) })
  window.addEventListener('online', () => { void syncNow() })
  window.addEventListener('focus', () => { void syncNow() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow() })
  window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow() }, 60_000)
  void unsubscribeOwner
  void unsubscribeChanges
}
