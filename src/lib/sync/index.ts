import { dbApplySyncRecord, dbGetSyncRecords, dbGetSyncFile, dbSaveSyncFile, dbMergeGuestFilesIntoAccount } from '../../db'
import type { DbSyncRecord } from '../../db'
import { supabase } from '../supabase'
import { applyScopedRecord, getLocalDataOwner, getLocalTombstones, getSyncDeviceId, getScopedLocalRecords, mergeGuestNamespaceInto, setScopedStorageItem, subscribeLocalChanges, subscribeLocalDataOwner } from '../localData'
import type { LocalDataOwner, ScopedLocalRecord } from '../localData'
import { mergeRecordSets, mergeSyncRecords } from './merge'
import type { SyncRecord } from './merge'
import { useSyncExternalStore } from 'react'

interface RemoteRow { kind: string; id: string; data: unknown; updated_at: number; deleted: boolean; device_id: string }
interface OutboxEntry extends SyncRecord { ownerId: LocalDataOwner; queuedAt: number; attempts: number }
const OUTBOX_DB = 'vexale-sync-outbox-v1'
const OUTBOX_STORE = 'records'
const DEVICE_META_KEY = 'vexale-sync-record-devices-v1'
const FILE_UPLOAD_META_KEY = 'vexale-sync-file-uploaded-v1'
const LAST_SYNC_KEY = 'vexale-sync-last-success-v1'
const PAGE_SIZE = 250
const MAX_FILE_BYTES = 50 * 1024 * 1024
let running = false
let debounceTimer: ReturnType<typeof setTimeout> | undefined
const SERVER_UNAVAILABLE = 'الخادم غير متاح'

function readLastSyncAt(): number | null {
  try { const value = Number(localStorage.getItem(LAST_SYNC_KEY)); return Number.isFinite(value) && value > 0 ? value : null } catch { return null }
}
export type SyncPhase = 'synced' | 'syncing' | 'offline' | 'error'
export type FileSyncState = 'pending' | 'uploading' | 'synced' | 'offline' | 'error' | 'too-large' | 'downloading'
export interface SyncStatus { phase: SyncPhase; pendingCount: number; lastSyncAt: number | null; error: string | null; files: Record<string, FileSyncState> }
let syncStatus: SyncStatus = { phase: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced', pendingCount: 0, lastSyncAt: readLastSyncAt(), error: null, files: {} }
const statusListeners = new Set<() => void>()
function updateStatus(update: Partial<SyncStatus>): void {
  syncStatus = { ...syncStatus, ...update }
  if (typeof update.lastSyncAt === 'number') { try { localStorage.setItem(LAST_SYNC_KEY, String(update.lastSyncAt)) } catch { /* Keep this diagnostic optional. */ } }
  statusListeners.forEach(listener => listener())
}
const subscribeStatus = (listener: () => void): (() => void) => { statusListeners.add(listener); return () => statusListeners.delete(listener) }
export function useSyncStatus(): SyncStatus { return useSyncExternalStore(subscribeStatus, () => syncStatus, () => syncStatus) }
export function getSyncStatus(): SyncStatus { return syncStatus }
function setFileStatus(id: string, state: FileSyncState): void { updateStatus({ files: { ...syncStatus.files, [id]: state } }) }
function uploadedFiles(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FILE_UPLOAD_META_KEY) ?? '{}') as Record<string, number> } catch { return {} }
}
function markFileUploaded(owner: LocalDataOwner, id: string, updatedAt: number): void {
  const metadata = uploadedFiles(); metadata[`${owner}\u0000${id}`] = updatedAt
  try { localStorage.setItem(FILE_UPLOAD_META_KEY, JSON.stringify(metadata)) } catch { /* The next session may upload again safely using upsert. */ }
}

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
  updateStatus({ pendingCount: (await getOutbox(ownerId)).length })
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
  updateStatus({ pendingCount: (await getOutbox(getLocalDataOwner())).length })
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
  for (const record of dbRecords) records.push({ ...record, deviceId: recordDeviceId(owner, record.kind, record.id, record.updatedAt) })
  return records
}
async function applyRecord(record: SyncRecord, owner: LocalDataOwner): Promise<void> {
  rememberRecordDevice(owner, record)
  if (record.kind === 'local') {
    applyScopedRecord({ key: record.id, value: typeof record.data === 'string' ? record.data : JSON.stringify(record.data), updatedAt: record.updatedAt, deleted: record.deleted, ownerId: owner }, owner)
    return
  }
  if (record.kind === 'files' || record.kind === 'notes' || record.kind === 'ocr') {
    await dbApplySyncRecord({ kind: record.kind, id: record.id, data: record.data, updatedAt: record.updatedAt, deleted: record.deleted } as DbSyncRecord, owner)
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
async function push(): Promise<boolean> {
  if (!supabase || running || !navigator.onLine || !getLocalDataOwner().startsWith('acct:')) return false
  running = true
  try {
    const owner = getLocalDataOwner()
    const entries = await getOutbox(owner)
    for (let index = 0; index < entries.length; index += PAGE_SIZE) {
      if (getLocalDataOwner() !== owner) return false
      const batch = entries.slice(index, index + PAGE_SIZE)
      const { error } = await supabase.from('sync_items').upsert(batch.map(({ kind, id, data, updatedAt, deleted, deviceId }) => ({ kind, id, data, updated_at: updatedAt, deleted, device_id: deviceId })), { onConflict: 'user_id,kind,id' })
      if (error) throw error
      await removeOutbox(batch.map(entry => entry.key))
    }
    return true
  } catch {
    updateStatus({ phase: 'error', error: SERVER_UNAVAILABLE })
    return false
  } finally { running = false }
}
async function syncNow(): Promise<void> {
  const owner = getLocalDataOwner()
  if (!owner.startsWith('acct:') || document.visibilityState === 'hidden') return
  if (!navigator.onLine) { updateStatus({ phase: 'offline', error: null }); return }
  updateStatus({ phase: 'syncing', error: null })
  try {
    await pull(owner)
    await queue(await collectOwner(owner), owner)
    if (!await push()) return
    await uploadPendingFiles(owner)
    updateStatus({ phase: 'synced', error: null, lastSyncAt: Date.now(), pendingCount: (await getOutbox(owner)).length })
  } catch {
    updateStatus({ phase: 'error', error: SERVER_UNAVAILABLE })
  }
}
function schedulePush(immediate = false): void {
  clearTimeout(debounceTimer)
  const run = async (): Promise<void> => {
    const owner = getLocalDataOwner()
    if (owner === 'guest') return
    try {
      await queue(await collectOwner(owner), owner)
      if (!navigator.onLine) { updateStatus({ phase: 'offline', error: null }); return }
      if (await push()) { await uploadPendingFiles(owner); updateStatus({ phase: 'synced', error: null, lastSyncAt: Date.now() }) }
    } catch { updateStatus({ phase: navigator.onLine ? 'error' : 'offline', error: navigator.onLine ? SERVER_UNAVAILABLE : null }) }
  }
  if (immediate) void run()
  else debounceTimer = setTimeout(() => { void run() }, 2000)
}

let initialized = false
export function initializeSync(): void {
  if (initialized || typeof window === 'undefined') return
  if (!supabase) { updateStatus({ phase: 'offline' }); return }
  initialized = true
  const activate = async (owner: LocalDataOwner): Promise<void> => {
    if (!owner.startsWith('acct:')) return
    const mergeMarker = 'vexale-sync-guest-merged-v1'
    const firstAccount = window.localStorage.getItem(mergeMarker) === null
    let records = await collectOwner(owner)
    if (firstAccount) {
      await dbMergeGuestFilesIntoAccount(owner)
      mergeGuestNamespaceInto(owner)
      const guestRecords = await collectOwner('guest')
      records = mergeRecordSets(records, guestRecords)
      records = records.map(record => record.kind === 'files' && record.data && typeof record.data === 'object'
        ? { ...record, data: { ...(record.data as Record<string, unknown>), storagePath: `${owner.slice(5)}/${record.id}` } }
        : record)
      for (const record of records) await applyRecord(record, owner)
      try { window.localStorage.setItem(mergeMarker, owner) } catch { /* Repeat the idempotent union on the next session. */ }
    }
    await queue(records, owner)
    updateStatus({ pendingCount: (await getOutbox(owner)).length })
    void syncNow()
  }
  const unsubscribeOwner = subscribeLocalDataOwner(() => { void activate(getLocalDataOwner()) })
  const unsubscribeChanges = subscribeLocalChanges(schedulePush)
  supabase.auth.getSession().then(({ data }) => { if (data.session?.user.id) void activate(`acct:${data.session.user.id}`); else updateStatus({ phase: 'offline' }) }).catch(() => updateStatus({ phase: 'error', error: SERVER_UNAVAILABLE }))
  supabase.auth.onAuthStateChange((_event, session) => { if (session?.user.id) void activate(`acct:${session.user.id}`); else updateStatus({ phase: 'offline' }) })
  window.addEventListener('online', () => { updateStatus({ phase: 'syncing', error: null }); void syncNow() })
  window.addEventListener('offline', () => updateStatus({ phase: 'offline', error: null }))
  window.addEventListener('focus', () => { void syncNow() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow() })
  void unsubscribeOwner
  void unsubscribeChanges
}

export function retrySyncNow(): void { void syncNow() }


async function uploadPendingFiles(owner: LocalDataOwner): Promise<void> {
  if (!supabase || !navigator.onLine || !owner.startsWith('acct:')) return
  const [records] = await Promise.all([dbGetSyncRecords(owner)])
  for (const record of records) {
    if (record.kind !== 'files' || record.deleted) continue
    const key = `${owner}\u0000${record.id}`
    if (uploadedFiles()[key] === record.updatedAt) { setFileStatus(record.id, 'synced'); continue }
    const stored = await dbGetSyncFile(record.id, owner)
    if (!(stored?.file instanceof Blob)) continue
    if (stored.file.size > MAX_FILE_BYTES) { setFileStatus(record.id, 'too-large'); continue }
    if (!navigator.onLine) { setFileStatus(record.id, 'offline'); return }
    const path = `${owner.slice(5)}/${record.id}`
    setFileStatus(record.id, 'uploading')
    const { error } = await supabase.storage.from('vexale-files').upload(path, stored.file, { upsert: true, contentType: stored.file.type || 'application/octet-stream' })
    if (error) { setFileStatus(record.id, 'error'); throw error }
    markFileUploaded(owner, record.id, record.updatedAt)
    setFileStatus(record.id, 'synced')
  }
}

export async function ensureFileAvailable(id: string): Promise<void> {
  const owner = getLocalDataOwner()
  if (!supabase || !owner.startsWith('acct:')) throw new Error('Sign in to download this file.')
  const local = await dbGetSyncFile(id, owner)
  if (local?.file instanceof Blob) { setFileStatus(id, 'synced'); return }
  if (!navigator.onLine) { setFileStatus(id, 'offline'); throw new Error('You are offline.') }
  setFileStatus(id, 'downloading')
  try {
    const { data: row, error: rowError } = await supabase.from('sync_items').select('data').eq('kind', 'files').eq('id', id).maybeSingle()
    if (rowError) throw rowError
    const payload = row?.data as { storagePath?: string } | undefined
    const path = payload?.storagePath || `${owner.slice(5)}/${id}`
    const { data, error } = await supabase.storage.from('vexale-files').download(path)
    if (error) throw error
    if (!data) throw new Error('The file is not available in cloud storage yet.')
    await dbSaveSyncFile(id, data, owner)
    if (local) markFileUploaded(owner, id, local.updatedAt ?? 0)
    setFileStatus(id, 'synced')
  } catch (error) {
    setFileStatus(id, navigator.onLine ? 'error' : 'offline')
    throw error
  }
}
