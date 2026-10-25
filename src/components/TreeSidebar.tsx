import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { PALETTE, findNode, sfx, useLibrary, useTree } from '../shared'
import type { TNode } from '../shared'
import { TRASH_RETENTION_DAYS, useSettings } from '../lib/settings'
import { tr, useLocale } from '../lib/i18n'
import { collectNodeIds, moveToTrash } from '../lib/trash'
import Uploader from './Uploader'
import Sketchpad from './Sketchpad'
import Library from './Library'
import ToolsPanel from './ToolsPanel'
import NotesEditor from './NotesEditor'

interface SectionOption {
  id: string
  path: string[]
  label: string
}

function sectionOptions(nodes: TNode[], parentPath: string[] = [], parentTitles: string[] = []): SectionOption[] {
  return nodes.flatMap(node => {
    const path = [...parentPath, node.id]
    const titles = [...parentTitles, node.title]
    return [{ id: node.id, path, label: titles.join(' / ') }, ...sectionOptions(node.children, path, titles)]
  })
}

function resolveSection(tree: TNode[], path: string[]): { node: TNode; parentPath: string[]; depth: number } | null {
  if (!path.length) return null
  let level = tree
  let node: TNode | undefined
  for (const id of path) {
    node = level.find(item => item.id === id)
    if (!node) return null
    level = node.children
  }
  return node ? { node, parentPath: path.slice(0, -1), depth: path.length - 1 } : null
}

const HIDDEN_EMPTY_STARTER_CATEGORY_IDS = new Set(['domain-trading', 'domain-welding'])

interface AddFormProps {
  placeholder: string
  color: string
  addLabel: string
  onSubmit: (title: string) => void
}

function AddForm({ placeholder, color, addLabel, onSubmit }: AddFormProps) {
  const [value, setValue] = useState('')
  const submit = (): void => {
    const title = value.trim()
    if (!title) return
    onSubmit(title)
    setValue('')
  }

  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') submit() }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-white/20 focus:ring-1"
        style={{ ['--tw-ring-color' as string]: color }}
      />
      <button
        type="button"
        aria-label={addLabel}
        onClick={submit}
        className="flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-black transition active:scale-95"
        style={{ background: color }}
      >
        <Plus size={14} />{addLabel}
      </button>
    </div>
  )
}

interface TreeNodeItemProps {
  node: TNode
  parentPath: string[]
  depth: number
  onNotice: (message: string) => void
  singleSectionFocus?: boolean
}

function TreeNodeItem({ node, parentPath, depth, onNotice, singleSectionFocus = false }: TreeNodeItemProps) {
  const locale = useLocale()
  const { viewMode } = useSettings()
  const { items } = useLibrary()
  const { tree, path, setPath, addNode, removeNode } = useTree()
  const [sketchOpen, setSketchOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const color = PALETTE[node.ci % PALETTE.length]
  const myPath = [...parentPath, node.id]
  const open = path[depth] === node.id
  const active = open && path.length === myPath.length
  const count = items.filter(item => item.nodeId === node.id).length
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)
  const nodePathKey = myPath
    .map(id => findNode(tree, id)?.title.trim().normalize('NFKC').toLocaleLowerCase(locale) ?? '')
    .filter(Boolean)
    .join('/')

  const toggle = (): void => {
    if (open) sfx.close()
    else sfx.open()
    setPath(open ? parentPath : myPath)
  }

  const handleDelete = async (): Promise<void> => {
    if (deleting) return
    const message = text(
      `Move “${node.title}” and its sections and files to the trash? You can restore it from Settings for ${TRASH_RETENTION_DAYS} days.`,
      `نقل «${node.title}» وكل فروعه وملفاته إلى المحذوفات؟ يمكنك استعادته من الإعدادات خلال ${TRASH_RETENTION_DAYS} يوماً.`,
    )
    if (!window.confirm(message)) return
    setDeleting(true)

    const ids = new Set(collectNodeIds(node))
    const files = items.flatMap(item => ids.has(item.nodeId) && item.file
      ? [{ nodeId: item.nodeId, name: item.name, kind: item.kind, size: item.size, file: item.file }]
      : [])
    const parentId = parentPath.length ? parentPath[parentPath.length - 1] : null
    const siblings = parentId === null ? tree : findNode(tree, parentId)?.children ?? []
    const index = Math.max(0, siblings.findIndex(sibling => sibling.id === node.id))
    const saved = await moveToTrash({ node, parentId, index, files })

    if (!saved) {
      const force = window.confirm(text(
        'The trash could not be saved in this browser. Permanently delete this section?',
        'تعذّر حفظ العنصر في المحذوفات. هل تريد حذفه نهائياً؟',
      ))
      if (!force) {
        setDeleting(false)
        return
      }
    }

    sfx.close()
    setPath(parentPath)
    removeNode(node.id)
    onNotice(saved
      ? text(`“${node.title}” was moved to the trash.`, `نُقل «${node.title}» إلى المحذوفات.`)
      : text(`“${node.title}” was permanently removed.`, `حُذف «${node.title}» نهائياً.`))
  }

  return (
    <div
      className="overflow-hidden rounded-xl transition-shadow"
      style={{
        borderInlineStart: `3px solid ${color}`,
        background: open ? `linear-gradient(90deg, ${color}12, rgba(20,23,31,.78))` : 'rgba(20,23,31,.72)',
        boxShadow: open ? `0 0 0 1px ${color}55, 0 8px 24px ${color}22` : 'none',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={`flex w-full items-center justify-between gap-2 px-4 text-start transition hover:bg-white/[0.03] ${depth === 0 ? (viewMode === 'compact' ? 'py-2.5 text-base font-semibold sm:text-lg' : 'py-3 text-base font-semibold sm:text-lg') : (viewMode === 'compact' ? 'py-2 text-sm' : 'py-2.5 text-sm')}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate" style={{ color: open ? color : undefined }}>{node.title}</span>
          {count > 0 && <span className="rounded-full px-2 text-xs tabular-nums" style={{ background: color + '33', color }}>{count}</span>}
          {active && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-label={text('Selected section', 'القسم المحدد')} />}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={18} /></motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={`${viewMode === 'compact' ? 'space-y-2.5' : 'space-y-3'} p-3`}>
              <Uploader nodeId={node.id} color={color} />
              <button
                type="button"
                onClick={() => { setSketchOpen(value => !value); sfx.click() }}
                aria-pressed={sketchOpen}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm transition hover:bg-white/20"
              >
                <Pencil size={14} />{sketchOpen ? text('Hide sketchpad', 'إخفاء لوحة الرسم') : text('Sketchpad', 'لوحة الرسم')}
              </button>
              {sketchOpen && <Sketchpad nodeId={node.id} color={color} />}
              <Library nodeId={node.id} color={color} />
              {active && <NotesEditor key={node.id} nodeId={node.id} title={node.title} nodePathKey={nodePathKey} />}

              <div className="space-y-2 border-t border-white/10 pt-3">
                <AddForm
                  placeholder={text(`New section inside “${node.title}”`, `فرع جديد داخل «${node.title}»`)}
                  color={color}
                  addLabel={text('Add', 'إضافة')}
                  onSubmit={title => {
                    const id = addNode(node.id, title)
                    sfx.success()
                    setPath([...myPath, id])
                  }}
                />
                <button
                  type="button"
                  onClick={() => { void handleDelete() }}
                  disabled={deleting}
                  className="flex items-center gap-1.5 text-xs opacity-65 transition hover:opacity-100 disabled:opacity-40"
                >
                  <Trash2 size={12} />{deleting ? text('Moving…', 'جارٍ النقل…') : text('Move this section to trash', 'نقل هذا الفرع إلى المحذوفات')}
                </button>
              </div>

              {node.children.length > 0 && !singleSectionFocus && (
                <motion.div
                  initial={{ opacity: 0, paddingInlineStart: 0 }}
                  animate={{ opacity: 1, paddingInlineStart: 24 }}
                  exit={{ opacity: 0, paddingInlineStart: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="space-y-2"
                  style={{ borderInlineStart: `2px solid ${color}66`, marginInlineStart: 8 }}
                >
                  {node.children.map(child => (
                    <div key={child.id} className="relative">
                      <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: -24, top: 20, width: 24, height: 2, background: color + '66' }} />
                      <TreeNodeItem node={child} parentPath={myPath} depth={depth + 1} onNotice={onNotice} />
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TreeSidebar() {
  const locale = useLocale()
  const { viewMode } = useSettings()
  const compactMode = viewMode === 'compact'
  const singleSectionMode = viewMode === 'single-section'
  const { tree, path, setPath, addNode } = useTree()
  const { items } = useLibrary()
  const [notice, setNotice] = useState('')
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)
  const visibleTree = tree.filter(node =>
    !HIDDEN_EMPTY_STARTER_CATEGORY_IDS.has(node.id) ||
    node.children.length > 0 ||
    items.some(item => item.nodeId === node.id),
  )
  const options = sectionOptions(visibleTree)
  const selected = resolveSection(visibleTree, path)

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 6_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  return (
    <main
      data-tour="tree-categories"
      data-view-mode={viewMode}
      data-panel-side={locale === 'ar' ? 'right' : 'left'}
      className={singleSectionMode
        ? 'fixed inset-x-0 bottom-0 top-14 z-10 overflow-y-auto overscroll-contain bg-slate-950/95 px-3 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 sm:px-6 sm:py-5'
        : compactMode
          ? `fixed bottom-0 top-14 z-10 w-full max-w-[31rem] overflow-y-auto overscroll-contain border-white/10 bg-slate-950/90 px-3 py-4 shadow-2xl shadow-black/40 backdrop-blur-2xl transition-[width,transform] duration-300 ease-out sm:px-4 sm:py-5 ${locale === 'ar' ? 'right-0 border-l' : 'left-0 border-r'}`
          : 'relative mx-auto w-full max-w-none space-y-3 px-3 py-5 transition-[max-width,padding] duration-300 ease-out sm:px-5 sm:py-6'}
    >
      {singleSectionMode ? (
        <div className="mx-auto max-w-4xl space-y-3">
          <div className="glass sticky top-0 z-10 grid gap-2 rounded-2xl border border-white/10 p-3 shadow-lg shadow-black/20 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(14rem,1.3fr)] sm:items-center sm:p-4">
            <label htmlFor="single-section-picker" className="text-sm font-semibold">{text('Single-section focus', 'التركيز على قسم واحد')}</label>
            <select
              id="single-section-picker"
              aria-label={text('Choose a section to focus on', 'اختر القسم الذي تريد التركيز عليه')}
              value={path[path.length - 1] ?? ''}
              onChange={event => {
                const option = options.find(item => item.id === event.target.value)
                sfx.open()
                setPath(option?.path ?? [])
              }}
              className="min-w-0 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
            >
              <option value="">{text('Choose a section…', 'اختر قسماً…')}</option>
              {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>

          {notice && <p role="status" className="glass rounded-xl border border-white/10 px-3 py-2 text-sm">{notice}</p>}
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div key={selected.node.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                <TreeNodeItem
                  node={selected.node}
                  parentPath={selected.parentPath}
                  depth={selected.depth}
                  onNotice={setNotice}
                  singleSectionFocus
                />
              </motion.div>
            ) : (
              <motion.p key="no-selected-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass rounded-2xl px-4 py-10 text-center text-sm opacity-70">
                {visibleTree.length
                  ? text('Choose a section from the selector above to focus on it.', 'اختر قسماً من القائمة أعلاه لعرضه وحده.')
                  : text('There are no sections yet. Switch to full view to create one.', 'لا توجد أقسام بعد. انتقل إلى العرض الكامل لإنشاء قسم.')}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <>
          <section className={`glass rounded-2xl border border-white/[0.06] ${compactMode ? 'p-3 sm:p-4' : 'p-3.5 sm:p-4'}`}>
            <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-white/80">
              <FolderPlus size={16} style={{ color: 'var(--accent)' }} />{text('Create a top-level category', 'إنشاء قسم رئيسي')}
            </div>
            <AddForm
              placeholder={text('Quran, science, languages, exam prep…', 'القرآن، العلوم، اللغات، مراجعة الاختبارات…')}
              color="var(--accent)"
              addLabel={text('Add category', 'إضافة قسم')}
              onSubmit={title => {
                const id = addNode(null, title)
                sfx.success()
                setPath([id])
              }}
            />
          </section>

          {notice && <p role="status" className="glass rounded-xl border border-white/10 px-3 py-2 text-sm">{notice}</p>}

          <section aria-label={text('Library tools', 'أدوات المكتبة')}>
            <ToolsPanel />
          </section>

          {visibleTree.length === 0 && <p className="py-6 text-center text-sm opacity-60">{text('No categories yet. Create your first one above.', 'لا توجد أقسام بعد. أنشئ أول قسم من الأعلى.')}</p>}
          <div className={compactMode ? 'space-y-2' : 'space-y-2.5'}>
            {visibleTree.map(node => <TreeNodeItem key={node.id} node={node} parentPath={[]} depth={0} onNotice={setNotice} />)}
          </div>
        </>
      )}
    </main>
  )
}
