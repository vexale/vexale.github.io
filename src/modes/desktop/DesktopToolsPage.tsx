import { lazy, Suspense, useEffect, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Activity, Bot, Brain, Calculator, Database, Headphones, ListChecks, Network, ScanText, Sigma, StickyNote, Terminal, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TOOL_CATALOG } from '../../lib/settings'
import { useTree } from '../../shared'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'

const LazyTools = {
  calc: lazy(() => import('../../components/Calculator')), notes: lazy(() => import('../../components/QuickNotes')),
  plot: lazy(() => import('../../components/CoordinateSystem')), chat: lazy(() => import('../../components/AIChat')),
  math: lazy(() => import('../../components/AIMathSolver')), code: lazy(() => import('../../components/CodePlayground')),
  quiz: lazy(() => import('../../components/QuizGenerator')), data: lazy(() => import('../../components/DataAnalyzer')),
  board: lazy(() => import('../../components/Whiteboard')), docs: lazy(() => import('../../components/DocumentTools')),
  tasks: lazy(() => import('../../components/TaskRoadmap')), audio: lazy(() => import('../../components/AudioTools')),
}
const ICONS: Record<string, LucideIcon> = { calc: Calculator, notes: StickyNote, plot: Activity, chat: Bot, math: Sigma, code: Terminal, quiz: Brain, data: Database, board: Network, docs: ScanText, tasks: ListChecks, audio: Headphones }
const AR_LABELS: Record<string, string> = { calc: 'الحاسبة', notes: 'ملاحظات سريعة', plot: 'الإحداثيات', chat: 'محادثة المكتبة', math: 'حلّال الرياضيات', code: 'مساحة الأكواد', quiz: 'اختبارات وبطاقات', data: 'تحليل البيانات', board: 'لوحة وخرائط', docs: 'أدوات المستندات', tasks: 'المهام', audio: 'تركيز وصوت' }
type Labels = ReturnType<typeof useDesktopMessages>['toolHub']

function filterSections(nodes: ReturnType<typeof useTree>['tree'], query: string): ReturnType<typeof useTree>['tree'] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return nodes
  return nodes.flatMap(node => {
    const children = filterSections(node.children, query)
    return node.title.toLocaleLowerCase().includes(normalized) || children.length ? [{ ...node, children }] : []
  })
}

function SectionPicker({ tree, selectedIds, labels, onToggle, onClose }: { tree: ReturnType<typeof useTree>['tree']; selectedIds: string[]; labels: Labels; onToggle: (id: string, checked: boolean) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const visibleTree = filterSections(tree, query)
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const renderNodes = (nodes: ReturnType<typeof useTree>['tree'], depth = 0): ReactElement[] => nodes.flatMap(node => [
    <label className="desk-tool-section-option" key={node.id} role="treeitem" aria-level={depth + 1} style={{ '--desk-section-depth': depth } as CSSProperties}>
      <input type="checkbox" checked={selectedIds.includes(node.id)} onChange={event => onToggle(node.id, event.target.checked)} />
      <span>{node.title}</span>
    </label>,
    ...renderNodes(node.children, depth + 1),
  ])
  return <div className="desk-tool-picker" role="dialog" aria-label={labels.sectionPicker}>
    <div className="desk-tool-picker-header"><strong>{labels.sectionPicker}</strong><button type="button" className="desk-icon-button" aria-label={labels.closePicker} onClick={onClose}><X size={15} aria-hidden="true" /></button></div>
    <input className="desk-tool-picker-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={labels.searchSections} aria-label={labels.searchSections} />
    <div className="desk-tool-picker-tree" role="tree">{tree.length ? (visibleTree.length ? renderNodes(visibleTree) : <p>{labels.noMatchingSections}</p>) : <p>{labels.noSections}</p>}</div>
  </div>
}

export function DesktopToolPanel({ toolId, onClose }: { toolId: string; onClose: () => void }) {
  const tool = TOOL_CATALOG.find(item => item.id === toolId)
  const Component = LazyTools[toolId as keyof typeof LazyTools]
  const locale = useLocale()
  const label = tool ? (locale === 'ar' ? AR_LABELS[tool.id] : tool.label) : ''
  if (!tool || !Component) return null
  const labels = useDesktopMessages().toolHub
  return <aside className="desk-tool-panel" aria-label={label}>
    <header><h2>{label}</h2><button type="button" className="desk-icon-button" aria-label={labels.close} onClick={onClose}><X size={17} aria-hidden="true" /></button></header>
    <div className="desk-tool-panel-content"><Suspense fallback={<p role="status">{labels.loading}</p>}><Component /></Suspense></div>
  </aside>
}

export default function DesktopToolsPage() {
  const messages = useDesktopMessages()
  const locale = useLocale()
  const prefs = useDesktopPreferences()
  const { tree } = useTree()
  const [openTool, setOpenTool] = useState('')
  const [openPicker, setOpenPicker] = useState('')
  const { toolHub: t } = messages
  const update = (id: string, patch: { global?: boolean; sectionIds?: string[] }): void => {
    const current = prefs.toolAssignments[id] ?? { global: true, sectionIds: [] }
    const next = { ...current, ...patch }
    updateDesktopPreferences({ toolAssignments: { ...prefs.toolAssignments, [id]: next } })
  }
  return <section className="desk-tools-hub" aria-label={messages.pages.tools.title}>
    <div className="desk-tools-grid">{TOOL_CATALOG.map(tool => {
      const Icon = ICONS[tool.id]
      const assignment = prefs.toolAssignments[tool.id] ?? { global: true, sectionIds: [] }
      const name = locale === 'ar' ? AR_LABELS[tool.id] : tool.label
      return <article className="desk-tool-card" key={tool.id}>
        <button type="button" className="desk-tool-launch" onClick={() => setOpenTool(tool.id)}><Icon size={18} aria-hidden="true" /><span className="desk-tool-name">{name}</span><span className="desk-tool-description">{t.descriptions[tool.id as keyof typeof t.descriptions]}</span></button>
        <div className="desk-tool-assignment" role="group" aria-label={`${name}: ${t.assignment}`}>
          <button type="button" className={`desk-tool-segment ${assignment.global ? 'is-active' : ''}`} aria-pressed={assignment.global} onClick={() => update(tool.id, { global: true, sectionIds: [] })}>{t.global}</button>
          <button type="button" className={`desk-tool-segment ${!assignment.global ? 'is-active' : ''}`} aria-pressed={!assignment.global} onClick={() => { update(tool.id, { global: false }); setOpenPicker(tool.id) }}>{t.sectionSpecific}{!assignment.global && <span className="desk-tool-count">{assignment.sectionIds.length} {t.sectionsCount}</span>}</button>
          {openPicker === tool.id && <SectionPicker tree={tree} selectedIds={assignment.sectionIds} labels={t} onClose={() => setOpenPicker('')} onToggle={(id, checked) => update(tool.id, { global: false, sectionIds: checked ? [...new Set([...assignment.sectionIds, id])] : assignment.sectionIds.filter(sectionId => sectionId !== id) })} />}
        </div>
      </article>
    })}</div>
    {openTool && <DesktopToolPanel toolId={openTool} onClose={() => setOpenTool('')} />}
  </section>
}
