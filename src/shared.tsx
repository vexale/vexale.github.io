/* eslint-disable react-refresh/only-export-components -- ملف الحالة المشتركة يصدّر عمداً providers وhooks وثوابت مستخدمة في التطبيق. */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { dbDelete, dbGetAll, dbPut } from './db'

// إعادة تصدير حتى لا يحتاج TreeSidebar.tsx لأي تعديل (الدالة نفسها في src/drive.ts)
export { backupAll } from './drive'

/* ============ مفاتيح الحفظ في localStorage ============ */
const TREE_KEY = 'atelier-tree-v1' // هيكل الأقسام والفروع
const PATH_KEY = 'atelier-path-v1' // الفروع المفتوحة حالياً

/* ============ المؤثرات الصوتية (Web Audio API) ============ */
let audioCtx: AudioContext | null = null

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.05, slideTo?: number) {
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    const t = audioCtx.currentTime
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(audioCtx.destination)
    o.start(t)
    o.stop(t + dur)
  } catch { /* الصوت غير متاح */ }
}

export const sfx = {
  click: () => tone(720, 0.07, 'triangle'),
  open: () => tone(300, 0.18, 'sine', 0.05, 640),
  close: () => tone(640, 0.18, 'sine', 0.05, 300),
  success: () => { tone(520, 0.12); setTimeout(() => tone(780, 0.16), 90) },
}

/* ============ الأنواع المشتركة ============ */
export interface TNode { id: string; title: string; ci: number; children: TNode[] }

export interface Item {
  id: string
  nodeId: string
  name: string
  kind: 'image' | 'audio' | 'doc' | 'drawing'
  url: string
  size: number
  file?: File
}

// نتيجة استعادة فرع من السلة:
// 'original' = عاد إلى أبيه وترتيبه الأصليين، 'root' = عاد كقسم رئيسي لأن أباه لم يعد موجوداً،
// 'conflict' = لم يُستعد لأن معرّفاً من معرّفاته موجود في الشجرة (تفادياً للتكرار)
export type RestoreResult = 'original' | 'root' | 'conflict'

export const PALETTE = ['#5eead4', '#f9a8d4', '#fcd34d', '#93c5fd', '#c4b5fd', '#fdba74', '#86efac', '#fda4af', '#67e8f9', '#f0abfc']

/* ============ دوال الشجرة ============ */
const DEFAULT_TREE: TNode[] = [
  { id: 'domain-quran', title: 'Quran', ci: 0, children: [] },
  { id: 'domain-art', title: 'Art', ci: 1, children: [] },
  { id: 'domain-learning', title: 'Learning', ci: 2, children: [] },
  { id: 'domain-projects', title: 'Projects', ci: 3, children: [] },
]

const mapTree = (nodes: TNode[], id: string, fn: (n: TNode) => TNode): TNode[] =>
  nodes.map(n => (n.id === id ? fn(n) : { ...n, children: mapTree(n.children, id, fn) }))
const removeFrom = (nodes: TNode[], id: string): TNode[] =>
  nodes.filter(n => n.id !== id).map(n => ({ ...n, children: removeFrom(n.children, id) }))
export const findNode = (nodes: TNode[], id: string): TNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n
    const f = findNode(n.children, id)
    if (f) return f
  }
}
const collectIds = (n: TNode): string[] => [n.id, ...n.children.flatMap(collectIds)]
// يدرج عقدة في موضع محدد مع تقييد الموضع داخل حدود القائمة
const insertAt = (list: TNode[], node: TNode, index: number): TNode[] => {
  const i = Math.min(Math.max(0, Math.trunc(index) || 0), list.length)
  return [...list.slice(0, i), node, ...list.slice(i)]
}

/* ============ القراءة والكتابة الآمنة في localStorage ============ */
function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null // بيانات تالفة أو التخزين غير متاح
  }
}
function writeJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ممتلئ أو ممنوع: نتجاهل */ }
}

// يتحقق أن كل عقدة سليمة البنية، حتى لا تنهار الواجهة إن تلف المحتوى المحفوظ
const isNode = (value: unknown): value is TNode => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const node = value as Record<string, unknown>
  return typeof node.id === 'string' && typeof node.title === 'string' && typeof node.ci === 'number' &&
    Array.isArray(node.children) && node.children.every(isNode)
}

function loadTree(): TNode[] {
  const parsed = readJSON(TREE_KEY)
  return Array.isArray(parsed) && parsed.every(isNode) ? parsed : DEFAULT_TREE
}
function loadPath(): string[] {
  const p = readJSON(PATH_KEY)
  return Array.isArray(p) && p.every(x => typeof x === 'string') ? p : []
}
// يقصّ المسار المحفوظ عند أول عقدة لم تعد موجودة (مثلاً بعد حذف فرع)
function validPath(tree: TNode[], raw: string[]): string[] {
  const out: string[] = []
  let level = tree
  for (const id of raw) {
    const n = level.find(x => x.id === id)
    if (!n) break
    out.push(id)
    level = n.children
  }
  return out
}

/* ============ حالة الملفات (معزولة حسب الفرع، ومحفوظة في IndexedDB) ============ */
interface LibCtx {
  items: Item[]
  add: (i: Omit<Item, 'id'>) => void
  remove: (id: string) => void
  removeByNodes: (nodeIds: string[]) => void
  ready: boolean        // true بعد انتهاء قراءة الملفات المحفوظة
  storageError: string  // رسالة فشل الحفظ الدائم (فارغة إن كان كل شيء سليماً)
}
const LibraryContext = createContext<LibCtx>(null!)
export const useLibrary = () => useContext(LibraryContext)

const errMsg = (e: unknown) =>
  e instanceof DOMException && e.name === 'QuotaExceededError'
    ? 'مساحة التخزين في المتصفح ممتلئة، لم يُحفظ الملف بشكل دائم'
    : 'تعذّر الحفظ الدائم للملفات، ستبقى متاحة حتى تحديث الصفحة فقط'

let seq = 0 // يضمن ترتيباً فريداً حتى لو أُضيفت عدة ملفات في اللحظة نفسها

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const itemsRef = useRef(items) // آخر نسخة من الملفات، نستخدمها في الحذف دون آثار جانبية داخل setState
  useLayoutEffect(() => { itemsRef.current = items }, [items])

  // استرجاع الملفات المحفوظة عند فتح الصفحة
  useEffect(() => {
    let cancelled = false
    dbGetAll()
      .then(recs => {
        if (cancelled) return
        const loaded: Item[] = recs
          .filter(r => r.file instanceof Blob)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(r => ({
            id: r.id, nodeId: r.nodeId, name: r.name, kind: r.kind, size: r.size,
            file: r.file, url: URL.createObjectURL(r.file),
          }))
        // دمج آمن: لا نكرر ملفاً أُضيف قبل اكتمال القراءة
        setItems(p => {
          const have = new Set(p.map(x => x.id))
          return [...loaded.filter(x => !have.has(x.id)), ...p]
        })
      })
      .catch(() => { if (!cancelled) setStorageError('التخزين الدائم غير متاح في هذا المتصفح أو الوضع، ستبقى الملفات حتى تحديث الصفحة فقط') })
      .finally(() => { if (!cancelled) setReady(true) })

    // نطلب من المتصفح ألا يمسح البيانات تلقائياً عند ضيق المساحة
    navigator.storage?.persist?.().catch(() => { /* تجاهل */ })
    return () => { cancelled = true }
  }, [])

  const add: LibCtx['add'] = i => {
    const id = crypto.randomUUID()
    setItems(p => [...p, { ...i, id }])
    if (i.file)
      dbPut({
        id, nodeId: i.nodeId, name: i.name, kind: i.kind, size: i.size, file: i.file,
        createdAt: Date.now() * 1000 + (seq++ % 1000),
      }).catch(e => setStorageError(errMsg(e)))
  }

  const remove = (id: string) => {
    const t = itemsRef.current.find(x => x.id === id)
    if (t) URL.revokeObjectURL(t.url)
    setItems(p => p.filter(x => x.id !== id))
    dbDelete([id]).catch(e => setStorageError(errMsg(e)))
  }

  const removeByNodes = (nodeIds: string[]) => {
    const gone = itemsRef.current.filter(x => nodeIds.includes(x.nodeId))
    gone.forEach(x => URL.revokeObjectURL(x.url))
    setItems(p => p.filter(x => !nodeIds.includes(x.nodeId)))
    dbDelete(gone.map(x => x.id)).catch(e => setStorageError(errMsg(e)))
  }

  return (
    <LibraryContext.Provider value={{ items, add, remove, removeByNodes, ready, storageError }}>
      {children}
    </LibraryContext.Provider>
  )
}

/* ============ حالة الشجرة والمسار النشط ============ */
interface TreeCtx {
  tree: TNode[]
  path: string[] // الفروع المفتوحة حالياً، من القسم الرئيسي حتى أعمق فرع
  setPath: (p: string[]) => void
  addNode: (parentId: string | null, title: string) => string
  removeNode: (id: string) => void
  restoreNode: (node: TNode, parentId: string | null, index: number) => RestoreResult
  titleOf: (id: string) => string
  accent: string
}
const TreeContext = createContext<TreeCtx>(null!)
export const useTree = () => useContext(TreeContext)

export function TreeProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TNode[]>(loadTree)
  const [rawPath, setPath] = useState<string[]>(loadPath)
  const { removeByNodes } = useLibrary()
  const treeRef = useRef(tree) // آخر نسخة من الشجرة، تتيح لـ restoreNode إرجاع نتيجة فورية متزامنة
  useLayoutEffect(() => { treeRef.current = tree }, [tree])

  // المسار المعروض دائماً سليم: لا يشير أبداً إلى فرع محذوف
  const path = useMemo(() => validPath(tree, rawPath), [tree, rawPath])

  // حفظ تلقائي عند أي تغيير
  useEffect(() => { writeJSON(TREE_KEY, tree) }, [tree])
  useEffect(() => { writeJSON(PATH_KEY, path) }, [path])

  const addNode: TreeCtx['addNode'] = (parentId, title) => {
    const id = crypto.randomUUID()
    setTree(t =>
      parentId === null
        ? [...t, { id, title, ci: t.length % PALETTE.length, children: [] }]
        : mapTree(t, parentId, p => ({
            ...p,
            children: [...p.children, { id, title, ci: (p.ci + 1 + p.children.length) % PALETTE.length, children: [] }],
          })),
    )
    return id
  }

  const removeNode = (id: string) => {
    const n = findNode(tree, id)
    if (n) removeByNodes(collectIds(n)) // يحذف ملفات الفرع وفروعه من الذاكرة ومن IndexedDB
    setTree(t => removeFrom(t, id))
  }

  // استعادة فرع من السلة إلى موضعه الأصلي، أو كقسم رئيسي إن لم يعد أبوه موجوداً
  const restoreNode: TreeCtx['restoreNode'] = (node, parentId, index) => {
    const current = treeRef.current
    if (collectIds(node).some(id => findNode(current, id))) return 'conflict'

    const parent = parentId === null ? undefined : findNode(current, parentId)
    const next: TNode[] = parent
      ? mapTree(current, parent.id, p => ({ ...p, children: insertAt(p.children, node, index) }))
      : insertAt(current, node, parentId === null ? index : current.length) // الأب مفقود: قسم رئيسي في النهاية

    treeRef.current = next // يمنع التعارض لو استُدعيت الدالة مرتين قبل إعادة الرسم
    setTree(next)
    return parentId !== null && !parent ? 'root' : 'original'
  }

  const titleOf = (id: string) => findNode(tree, id)?.title ?? ''
  const lastOpen = path.length ? findNode(tree, path[path.length - 1]) : undefined
  const accent = lastOpen ? PALETTE[lastOpen.ci % PALETTE.length] : '#8ab4ff'

  return (
    <TreeContext.Provider value={{ tree, path, setPath, addNode, removeNode, restoreNode, titleOf, accent }}>
      {children}
    </TreeContext.Provider>
  )
}
