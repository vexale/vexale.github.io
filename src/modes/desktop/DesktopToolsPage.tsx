import { lazy, Suspense, useState } from 'react'
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
const flattenSections = (nodes: ReturnType<typeof useTree>['tree']): Array<{ id: string; title: string }> => nodes.flatMap(node => [{ id: node.id, title: node.title }, ...flattenSections(node.children)])
const AR_LABELS: Record<string, string> = { calc: 'الحاسبة', notes: 'ملاحظات سريعة', plot: 'الإحداثيات', chat: 'محادثة المكتبة', math: 'حلّال الرياضيات', code: 'مساحة الأكواد', quiz: 'اختبارات وبطاقات', data: 'تحليل البيانات', board: 'لوحة وخرائط', docs: 'أدوات المستندات', tasks: 'المهام', audio: 'تركيز وصوت' }

export function DesktopToolPanel({ toolId, onClose }: { toolId: string; onClose: () => void }) {
  const tool = TOOL_CATALOG.find(item => item.id === toolId)
  const Component = LazyTools[toolId as keyof typeof LazyTools]
  const locale = useLocale()
  const label = tool ? (locale === 'ar' ? AR_LABELS[tool.id] : tool.label) : ''
  if (!tool || !Component) return null
  return <aside className="desk-tool-panel" aria-label={label}>
    <header><h2>{label}</h2><button type="button" className="desk-icon-button" aria-label={locale === 'ar' ? 'إغلاق الأداة' : 'Close tool'} onClick={onClose}><X size={17} /></button></header>
    <div className="desk-tool-panel-content"><Suspense fallback={<p role="status">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading tool…'}</p>}><Component /></Suspense></div>
  </aside>
}

export default function DesktopToolsPage() {
  const messages = useDesktopMessages()
  const locale = useLocale()
  const prefs = useDesktopPreferences()
  const { tree } = useTree()
  const sections = flattenSections(tree)
  const [openTool, setOpenTool] = useState('')
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
        <button type="button" className="desk-tool-launch" onClick={() => setOpenTool(tool.id)}><Icon size={18} aria-hidden="true" /><span>{name}</span><span className="desk-tool-chip">{assignment.global ? t.global : t.sectionSpecific}</span></button>
        <label className="desk-tool-global"><input type="checkbox" checked={assignment.global} onChange={event => update(tool.id, { global: event.target.checked, sectionIds: event.target.checked ? [] : assignment.sectionIds })} />{t.global}</label>
        <fieldset><legend>{t.sectionSpecific}</legend>{sections.length ? sections.map(section => <label key={section.id}><input type="checkbox" checked={assignment.sectionIds.includes(section.id)} disabled={assignment.global} onChange={event => update(tool.id, { global: false, sectionIds: event.target.checked ? [...new Set([...assignment.sectionIds, section.id])] : assignment.sectionIds.filter(id => id !== section.id) })} />{section.title}</label>) : <p>{t.noSections}</p>}</fieldset>
      </article>
    })}</div>
    {openTool && <DesktopToolPanel toolId={openTool} onClose={() => setOpenTool('')} />}
  </section>
}
