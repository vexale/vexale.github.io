/* ============ طبقة IndexedDB للملفات (بدون مكتبات خارجية) ============ */
const DB_NAME = 'atelier-library'
const STORE = 'items'
const NOTES_STORE = 'notes'
const OCR_STORE = 'ocr'

export interface StoredNote {
  nodeId: string
  html: string
  updatedAt: number
}

// السجل المحفوظ لكل ملف: الملف نفسه (File) مع بياناته
export interface StoredItem {
  id: string
  nodeId: string
  name: string
  kind: 'image' | 'audio' | 'doc' | 'drawing'
  size: number
  file: File
  createdAt: number // لاستعادة ترتيب الإضافة الأصلي
}

export interface StoredOcr {
  itemId: string
  text: string
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB غير متاح'))
      const req = indexedDB.open(DB_NAME, 3)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
        if (!req.result.objectStoreNames.contains(NOTES_STORE)) req.result.createObjectStore(NOTES_STORE, { keyPath: 'nodeId' })
        if (!req.result.objectStoreNames.contains(OCR_STORE)) req.result.createObjectStore(OCR_STORE, { keyPath: 'itemId' })
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => db.close() // يسمح بتحديث القاعدة من تبويب آخر
        res(db)
      }
      req.onerror = () => rej(req.error ?? new Error('تعذّر فتح قاعدة البيانات'))
    })
    dbPromise.catch(() => { dbPromise = null }) // نسمح بمحاولة جديدة لاحقاً
  }
  return dbPromise
}

export async function dbGetAll(): Promise<StoredItem[]> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    r.onsuccess = () => res(r.result as StoredItem[])
    r.onerror = () => rej(r.error)
  })
}

export async function dbPut(rec: StoredItem): Promise<void> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rec)
    tx.oncomplete = () => res()
    tx.onerror = tx.onabort = () => rej(tx.error) // الحصة الممتلئة تظهر هنا كـ QuotaExceededError
  })
}

export async function dbDelete(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await openDB()
  return new Promise((res, rej) => {
    const tx = db.transaction([STORE, OCR_STORE], 'readwrite')
    ids.forEach(id => {
      tx.objectStore(STORE).delete(id)
      tx.objectStore(OCR_STORE).delete(id)
    })
    tx.oncomplete = () => res()
    tx.onerror = tx.onabort = () => rej(tx.error)
  })
}

export async function dbGetAllOcr(): Promise<StoredOcr[]> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const request = db.transaction(OCR_STORE, 'readonly').objectStore(OCR_STORE).getAll()
    request.onsuccess = () => res(request.result as StoredOcr[])
    request.onerror = () => rej(request.error ?? new Error('تعذّرت قراءة نصوص OCR'))
  })
}

export async function dbPutOcr(itemId: string, text: string): Promise<void> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const transaction = db.transaction([STORE, OCR_STORE], 'readwrite')
    const itemRequest = transaction.objectStore(STORE).get(itemId)
    itemRequest.onsuccess = () => {
      if (!itemRequest.result) { transaction.abort(); return }
      transaction.objectStore(OCR_STORE).put({ itemId, text, updatedAt: Date.now() } satisfies StoredOcr)
    }
    transaction.oncomplete = () => res()
    transaction.onerror = transaction.onabort = () => rej(transaction.error ?? new Error('تعذّر حفظ نص OCR'))
  })
}

export async function dbGetNote(nodeId: string): Promise<StoredNote | null> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const request = db.transaction(NOTES_STORE, 'readonly').objectStore(NOTES_STORE).get(nodeId)
    request.onsuccess = () => res((request.result as StoredNote | undefined) ?? null)
    request.onerror = () => rej(request.error ?? new Error('تعذّر قراءة الملاحظة'))
  })
}

export async function dbPutNote(note: StoredNote): Promise<void> {
  const db = await openDB()
  return new Promise((res, rej) => {
    const transaction = db.transaction(NOTES_STORE, 'readwrite')
    transaction.objectStore(NOTES_STORE).put(note)
    transaction.oncomplete = () => res()
    transaction.onerror = transaction.onabort = () => rej(transaction.error ?? new Error('تعذّر حفظ الملاحظة'))
  })
}
