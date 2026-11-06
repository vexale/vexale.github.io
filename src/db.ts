/* ============ طبقة IndexedDB للملفات والملاحظات وOCR ============ */
import { clearLocalTombstones, getLocalDataOwner, recordLocalTombstones, notifyLocalDataChanged } from './lib/localData'
import type { LocalDataOwner } from './lib/localData'

const DB_NAME = 'atelier-library'
const STORE = 'items'
const NOTES_STORE = 'notes'
const OCR_STORE = 'ocr'
const SCOPED_STORE = 'items_scoped'
const SCOPED_NOTES_STORE = 'notes_scoped'
const SCOPED_OCR_STORE = 'ocr_scoped'

export interface StoredNote {
  nodeId: string
  html: string
  updatedAt: number
  deleted?: boolean
}

export interface StoredItem {
  id: string
  nodeId: string
  name: string
  kind: 'image' | 'audio' | 'doc' | 'drawing'
  size: number
  file: File
  createdAt: number
  updatedAt?: number
  deleted?: boolean
}

export interface StoredOcr {
  itemId: string
  text: string
  updatedAt: number
  deleted?: boolean
}

interface ScopedRecord {
  ownerId: string
  storageKey: string
}
interface ScopedItem extends StoredItem, ScopedRecord { updatedAt: number; deleted: boolean }
interface ScopedNote extends StoredNote, ScopedRecord { deleted: boolean }
interface ScopedOcr extends StoredOcr, ScopedRecord { deleted: boolean }

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB غير متاح'))
      const request = indexedDB.open(DB_NAME, 4)
      request.onupgradeneeded = event => {
        const database = request.result
        const transaction = request.transaction
        if (!transaction) return
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' })
        if (!database.objectStoreNames.contains(NOTES_STORE)) database.createObjectStore(NOTES_STORE, { keyPath: 'nodeId' })
        if (!database.objectStoreNames.contains(OCR_STORE)) database.createObjectStore(OCR_STORE, { keyPath: 'itemId' })
        const scopedItems = database.objectStoreNames.contains(SCOPED_STORE) ? transaction.objectStore(SCOPED_STORE) : database.createObjectStore(SCOPED_STORE, { keyPath: 'storageKey' })
        const scopedNotes = database.objectStoreNames.contains(SCOPED_NOTES_STORE) ? transaction.objectStore(SCOPED_NOTES_STORE) : database.createObjectStore(SCOPED_NOTES_STORE, { keyPath: 'storageKey' })
        const scopedOcr = database.objectStoreNames.contains(SCOPED_OCR_STORE) ? transaction.objectStore(SCOPED_OCR_STORE) : database.createObjectStore(SCOPED_OCR_STORE, { keyPath: 'storageKey' })

        if (event.oldVersion < 4) {
          const itemCursor = transaction.objectStore(STORE).openCursor()
          itemCursor.onsuccess = () => {
            const cursor = itemCursor.result
            if (!cursor) return
            const record = cursor.value as StoredItem
            const updatedAt = record.updatedAt ?? (Number.isFinite(record.createdAt) ? record.createdAt : Date.now())
            scopedItems.put({ ...record, ownerId: 'guest', storageKey: `guest:${record.id}`, updatedAt, deleted: record.deleted === true } satisfies ScopedItem)
            cursor.continue()
          }
          const noteCursor = transaction.objectStore(NOTES_STORE).openCursor()
          noteCursor.onsuccess = () => {
            const cursor = noteCursor.result
            if (!cursor) return
            const record = cursor.value as StoredNote
            scopedNotes.put({ ...record, ownerId: 'guest', storageKey: `guest:${record.nodeId}`, updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(), deleted: record.deleted === true } satisfies ScopedNote)
            cursor.continue()
          }
          const ocrCursor = transaction.objectStore(OCR_STORE).openCursor()
          ocrCursor.onsuccess = () => {
            const cursor = ocrCursor.result
            if (!cursor) return
            const record = cursor.value as StoredOcr
            scopedOcr.put({ ...record, ownerId: 'guest', storageKey: `guest:${record.itemId}`, updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(), deleted: record.deleted === true } satisfies ScopedOcr)
            cursor.continue()
          }
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }
      request.onerror = () => reject(request.error ?? new Error('تعذّر فتح قاعدة البيانات'))
    })
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

async function readAll<T extends ScopedRecord>(storeName: string, ownerId = getLocalDataOwner()): Promise<T[]> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve((request.result as T[]).filter(record => record.ownerId === ownerId))
    request.onerror = () => reject(request.error ?? new Error('تعذّرت قراءة السجلات المحلية'))
  })
}

export async function dbGetAll(): Promise<ScopedItem[]> {
  const ownerId = getLocalDataOwner()
  return (await readAll<ScopedItem>(SCOPED_STORE, ownerId)).filter(record => !record.deleted)
}

export async function dbGetAllSyncItems(): Promise<ScopedItem[]> {
  return readAll<ScopedItem>(SCOPED_STORE, getLocalDataOwner())
}

export async function dbPut(record: StoredItem, ownerId: LocalDataOwner = getLocalDataOwner()): Promise<void> {
  clearLocalTombstones('files', [record.id], ownerId)
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SCOPED_STORE, 'readwrite')
    transaction.objectStore(SCOPED_STORE).put({
      ...record,
      ownerId,
      storageKey: `${ownerId}:${record.id}`,
      updatedAt: record.updatedAt ?? Date.now(),
      deleted: false,
    } satisfies ScopedItem)
    transaction.oncomplete = () => { notifyLocalDataChanged(); resolve() }
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حفظ الملف'))
  })
}

export async function dbDelete(ids: string[]): Promise<void> {
  if (!ids.length) return
  const ownerId = getLocalDataOwner()
  recordLocalTombstones('files', ids, Date.now(), ownerId)
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SCOPED_STORE, SCOPED_OCR_STORE], 'readwrite')
    const itemStore = transaction.objectStore(SCOPED_STORE)
    const ocrStore = transaction.objectStore(SCOPED_OCR_STORE)
    ids.forEach(id => {
      const key = `${ownerId}:${id}`
      const itemRequest = itemStore.get(key)
      itemRequest.onsuccess = () => {
        const record = itemRequest.result as ScopedItem | undefined
        if (record) itemStore.put({ ...record, updatedAt: Date.now(), deleted: true })
      }
      const ocrRequest = ocrStore.get(key)
      ocrRequest.onsuccess = () => {
        const record = ocrRequest.result as ScopedOcr | undefined
        if (record) ocrStore.put({ ...record, updatedAt: Date.now(), deleted: true })
      }
    })
    transaction.oncomplete = () => { notifyLocalDataChanged(); resolve() }
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حذف الملف محلياً'))
  })
}

export async function dbGetAllOcr(): Promise<StoredOcr[]> {
  const ownerId = getLocalDataOwner()
  return (await readAll<ScopedOcr>(SCOPED_OCR_STORE, ownerId)).filter(record => !record.deleted)
}

export async function dbPutOcr(itemId: string, text: string): Promise<void> {
  const ownerId = getLocalDataOwner()
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SCOPED_STORE, SCOPED_OCR_STORE], 'readwrite')
    const itemKey = `${ownerId}:${itemId}`
    const itemRequest = transaction.objectStore(SCOPED_STORE).get(itemKey)
    itemRequest.onsuccess = () => {
      const item = itemRequest.result as ScopedItem | undefined
      if (!item || item.deleted) { transaction.abort(); return }
      transaction.objectStore(SCOPED_OCR_STORE).put({ itemId, text, ownerId, storageKey: itemKey, updatedAt: Date.now(), deleted: false } satisfies ScopedOcr)
    }
    transaction.oncomplete = () => { notifyLocalDataChanged(); resolve() }
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حفظ نص OCR'))
  })
}

export async function dbGetNote(nodeId: string, ownerId: LocalDataOwner = getLocalDataOwner()): Promise<StoredNote | null> {
  const database = await openDB()
  const key = `${ownerId}:${nodeId}`
  return new Promise((resolve, reject) => {
    const request = database.transaction(SCOPED_NOTES_STORE, 'readonly').objectStore(SCOPED_NOTES_STORE).get(key)
    request.onsuccess = () => {
      const record = request.result as ScopedNote | undefined
      resolve(record && !record.deleted ? record : null)
    }
    request.onerror = () => reject(request.error ?? new Error('تعذّر قراءة الملاحظة'))
  })
}

export async function dbGetAllNotes(): Promise<StoredNote[]> {
  return readAll<ScopedNote>(SCOPED_NOTES_STORE, getLocalDataOwner())
}

export async function dbPutNote(note: StoredNote, ownerId: LocalDataOwner = getLocalDataOwner()): Promise<void> {
  clearLocalTombstones('notes', [note.nodeId], ownerId)
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SCOPED_NOTES_STORE, 'readwrite')
    transaction.objectStore(SCOPED_NOTES_STORE).put({ ...note, ownerId, storageKey: `${ownerId}:${note.nodeId}`, updatedAt: note.updatedAt || Date.now(), deleted: false } satisfies ScopedNote)
    transaction.oncomplete = () => { notifyLocalDataChanged(); resolve() }
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حفظ الملاحظة'))
  })
}

export async function dbDeleteNotes(nodeIds: string[]): Promise<void> {
  if (!nodeIds.length) return
  const ownerId = getLocalDataOwner()
  recordLocalTombstones('notes', nodeIds, Date.now(), ownerId)
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SCOPED_NOTES_STORE, 'readwrite')
    const store = transaction.objectStore(SCOPED_NOTES_STORE)
    nodeIds.forEach(nodeId => {
      const request = store.get(`${ownerId}:${nodeId}`)
      request.onsuccess = () => {
        const note = request.result as ScopedNote | undefined
        if (note) store.put({ ...note, updatedAt: Date.now(), deleted: true })
      }
    })
    transaction.oncomplete = () => { notifyLocalDataChanged(); resolve() }
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حذف الملاحظات محلياً'))
  })
}

export async function dbClearCurrentUserData(ownerId: LocalDataOwner = getLocalDataOwner()): Promise<void> {
  const database = await openDB()
  const stores = [SCOPED_STORE, SCOPED_NOTES_STORE, SCOPED_OCR_STORE, ...(ownerId === 'guest' ? [STORE, NOTES_STORE, OCR_STORE] : [])]
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(stores, 'readwrite')
    for (const storeName of stores) {
      const store = transaction.objectStore(storeName)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const record = cursor.value as { ownerId?: string }
        if (storeName === STORE || storeName === NOTES_STORE || storeName === OCR_STORE || record.ownerId === ownerId) cursor.delete()
        cursor.continue()
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('تعذّر حذف البيانات المحلية'))
  })
}


export interface DbSyncRecord { kind: 'files' | 'notes' | 'ocr'; id: string; data: unknown; updatedAt: number; deleted: boolean }

export async function dbGetSyncRecords(ownerId: LocalDataOwner = getLocalDataOwner()): Promise<DbSyncRecord[]> {
  const [items, notes, ocr] = await Promise.all([
    readAll<ScopedItem>(SCOPED_STORE, ownerId), readAll<ScopedNote>(SCOPED_NOTES_STORE, ownerId), readAll<ScopedOcr>(SCOPED_OCR_STORE, ownerId),
  ])
  return [
    ...items.map(record => ({ kind: 'files' as const, id: record.id, data: { id: record.id, nodeId: record.nodeId, name: record.name, kind: record.kind, size: record.size, file: record.file, createdAt: record.createdAt }, updatedAt: record.updatedAt, deleted: record.deleted })),
    ...notes.map(record => ({ kind: 'notes' as const, id: record.nodeId, data: { nodeId: record.nodeId, html: record.html }, updatedAt: record.updatedAt, deleted: record.deleted })),
    ...ocr.map(record => ({ kind: 'ocr' as const, id: record.itemId, data: { itemId: record.itemId, text: record.text }, updatedAt: record.updatedAt, deleted: record.deleted })),
  ]
}

export async function dbApplySyncRecord(record: DbSyncRecord, ownerId: LocalDataOwner = getLocalDataOwner()): Promise<void> {
  const data = record.data as Record<string, unknown>
  const database = await openDB()
  const storeName = record.kind === 'files' ? SCOPED_STORE : record.kind === 'notes' ? SCOPED_NOTES_STORE : SCOPED_OCR_STORE
  const storageId = record.kind === 'files' ? String(data.id ?? record.id) : record.kind === 'notes' ? String(data.nodeId ?? record.id) : String(data.itemId ?? record.id)
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put({ ...data, ownerId, storageKey: `${ownerId}:${storageId}`, updatedAt: record.updatedAt, deleted: record.deleted })
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Failed to apply sync record'))
  })
}
