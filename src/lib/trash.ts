import { useSyncExternalStore } from 'react'
import type { Item, TNode } from '../shared'
import { TRASH_RETENTION_DAYS } from './settings'
import { clearLocalTombstones, getLocalDataOwner, recordLocalTombstones, subscribeLocalDataOwner } from './localData'
import type { LocalDataOwner } from './localData'

/* ============ الأنواع ============ */
export const DAY_MS = 86_400_000

export interface TrashFile {
  nodeId: string          // الفرع الذي كان الملف فيه
  name: string
  kind: Item['kind']
  size: number
  file: File
}

export interface TrashEntry {
  id: string
  title: string           // اسم الفرع المحذوف
  node: TNode             // الفرع بكل فروعه الفرعية
  parentId: string | null // أبوه الأصلي (null = قسم رئيسي)
  index: number           // ترتيبه بين إخوته، لإعادته إلى مكانه بالضبط
  deletedAt: number
  expiresAt: number       // بعد هذا الوقت يُحذف نهائياً
  files: TrashFile[]
  updatedAt?: number
  deleted?: boolean
}

interface ScopedTrashEntry extends TrashEntry { ownerId: string; storageKey: string; updatedAt: number; deleted: boolean }

export interface MoveToTrashInput {
  node: TNode
  parentId: string | null
  index: number
  files: TrashFile[]
}

interface TrashState {
  entries: TrashEntry[]
  ready: boolean          // true بعد قراءة السلة المحفوظة
  error: string           // رسالة إن كان التخزين الدائم غير متاح
}

/* ============ دوال مساعدة عامة ============ */
export const collectNodeIds = (n: TNode): string[] => [n.id, ...n.children.flatMap(collectNodeIds)]

export const daysLeft = (e: TrashEntry, now: number = Date.now()): number =>
  Math.max(0, Math.ceil((e.expiresAt - now) / DAY_MS))

/* ============ قاعدة IndexedDB مستقلة للسلة ============ */
const DB_NAME = 'atelier-trash'
const STORE = 'entries'
const SCOPED_STORE = 'entries_scoped'
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((res, rej) => {
      if (typeof indexedDB === 'undefined') {
        rej(new Error('IndexedDB غير متاح'))
        return
      }
      const req = indexedDB.open(DB_NAME, 2)
      req.onupgradeneeded = event => {
        const database = req.result
        const transaction = req.transaction
        if (!transaction) return
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' })
        const scoped = database.objectStoreNames.contains(SCOPED_STORE) ? transaction.objectStore(SCOPED_STORE) : database.createObjectStore(SCOPED_STORE, { keyPath: 'storageKey' })
        if (event.oldVersion < 2) {
          const cursorRequest = transaction.objectStore(STORE).openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return
            const entry = cursor.value as TrashEntry
            scoped.put({ ...entry, ownerId: 'guest', storageKey: `guest:${entry.id}`, updatedAt: entry.updatedAt ?? entry.deletedAt, deleted: entry.deleted === true } satisfies ScopedTrashEntry)
            cursor.continue()
          }
        }
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => db.close()
        res(db)
      }
      req.onerror = () => rej(req.error ?? new Error('تعذّر فتح قاعدة السلة'))
    })
    dbPromise.catch(() => { dbPromise = null }) // نسمح بمحاولة جديدة لاحقاً
  }
  return dbPromise
}

async function idbGetAll(): Promise<TrashEntry[]> {
  const ownerId = getLocalDataOwner()
  const db = await openDB()
  return new Promise<TrashEntry[]>((res, rej) => {
    const r = db.transaction(SCOPED_STORE, 'readonly').objectStore(SCOPED_STORE).getAll()
    r.onsuccess = () => res((r.result as ScopedTrashEntry[]).filter(entry => entry.ownerId === ownerId && !entry.deleted))
    r.onerror = () => rej(r.error)
  })
}

async function idbPut(entry: TrashEntry): Promise<void> {
  const ownerId = getLocalDataOwner()
  clearLocalTombstones('trash', [entry.id])
  const db = await openDB()
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(SCOPED_STORE, 'readwrite')
    tx.objectStore(SCOPED_STORE).put({ ...entry, ownerId, storageKey: `${ownerId}:${entry.id}`, updatedAt: entry.updatedAt ?? Date.now(), deleted: false } satisfies ScopedTrashEntry)
    tx.oncomplete = () => res()
    tx.onerror = tx.onabort = () => rej(tx.error) // الحصة الممتلئة تظهر هنا
  })
}

async function idbDelete(ids: string[]): Promise<void> {
  if (!ids.length) return
  const ownerId = getLocalDataOwner()
  recordLocalTombstones('trash', ids)
  const db = await openDB()
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(SCOPED_STORE, 'readwrite')
    ids.forEach(id => tx.objectStore(SCOPED_STORE).delete(`${ownerId}:${id}`))
    tx.oncomplete = () => res()
    tx.onerror = tx.onabort = () => rej(tx.error)
  })
}

export async function clearCurrentTrash(ownerId: LocalDataOwner = getLocalDataOwner()): Promise<void> {
  const db = await openDB()
  const stores = [SCOPED_STORE, ...(ownerId === 'guest' ? [STORE] : [])]
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite')
    for (const name of stores) {
      const store = transaction.objectStore(name)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const record = cursor.value as { ownerId?: string }
        if (name === STORE || record.ownerId === ownerId) cursor.delete()
        cursor.continue()
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حذف سلة المهملات'))
  })
}

/* ============ المتجر (يُقرأ من أي مكوّن عبر useTrash) ============ */
let state: TrashState = { entries: [], ready: false, error: '' }
const listeners = new Set<() => void>()

function setState(next: TrashState): void {
  state = next // نستبدل الكائن كاملاً ليبقى snapshot ثابتاً بين التغييرات
  listeners.forEach(l => l())
}

const isEntry = (e: unknown): e is TrashEntry => {
  const x = e as Partial<TrashEntry> | null
  return !!x && typeof x.id === 'string' && typeof x.title === 'string' && !!x.node &&
    Array.isArray(x.files) && typeof x.expiresAt === 'number' && typeof x.deletedAt === 'number'
}

// يحذف نهائياً كل عنصر انتهت مدته
async function purgeExpired(): Promise<void> {
  const now = Date.now()
  const gone = state.entries.filter(e => e.expiresAt <= now).map(e => e.id)
  if (!gone.length) return
  try { await idbDelete(gone) } catch { return }
  const set = new Set(gone)
  setState({ ...state, entries: state.entries.filter(e => !set.has(e.id)) })
}

async function loadTrash(): Promise<void> {
  try {
    const all = (await idbGetAll()).filter(isEntry).sort((a, b) => b.deletedAt - a.deletedAt)
    setState({ entries: all, ready: true, error: '' })
    await purgeExpired()
  } catch {
    setState({ entries: [], ready: true, error: 'التخزين الدائم غير متاح في هذا المتصفح أو الوضع، لن تعمل سلة المهملات.' })
  }
}
let initPromise: Promise<void> = loadTrash()
subscribeLocalDataOwner(() => {
  setState({ entries: [], ready: false, error: '' })
  initPromise = loadTrash()
})

// فحص دوري كل ساعة أثناء بقاء التطبيق مفتوحاً
if (typeof window !== 'undefined') window.setInterval(() => { void purgeExpired() }, 3_600_000)

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const getSnapshot = (): TrashState => state

export function useTrash(): TrashState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/* ============ العمليات ============ */
// ينقل فرعاً (وملفاته) إلى السلة. يعيد false إن تعذّر الحفظ (ولا يُحذف شيء حينها)
export async function moveToTrash(input: MoveToTrashInput): Promise<boolean> {
  await initPromise
  if (state.error) return false
  const now = Date.now()
  const entry: TrashEntry = {
    id: crypto.randomUUID(),
    title: input.node.title,
    node: input.node,
    parentId: input.parentId,
    index: input.index,
    deletedAt: now,
    expiresAt: now + TRASH_RETENTION_DAYS * DAY_MS,
    files: input.files,
    updatedAt: now,
    deleted: false,
  }
  try { await idbPut(entry) } catch { return false }
  setState({ ...state, entries: [entry, ...state.entries] })
  return true
}

// حذف نهائي لعنصر واحد
export async function removeFromTrash(id: string): Promise<boolean> {
  await initPromise
  try { await idbDelete([id]) } catch { return false }
  setState({ ...state, entries: state.entries.filter(e => e.id !== id) })
  return true
}

// إفراغ السلة بالكامل
export async function emptyTrash(): Promise<boolean> {
  await initPromise
  try { await idbDelete(state.entries.map(e => e.id)) } catch { return false }
  setState({ ...state, entries: [] })
  return true
}
