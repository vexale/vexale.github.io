import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Activity, Bot, Brain, Calculator as CalcIcon, Database, Headphones, ListChecks,
  Network, ScanText, Sigma, StickyNote, Terminal,
} from 'lucide-react'
import { sfx } from '../shared'
import { useSettings } from '../lib/settings'
import { useLocale, tr } from '../lib/i18n'
import type { Locale } from '../lib/i18n'
import { ACCENT } from './toolkit'
import FloatingWindow from './FloatingWindow'
import type { WinRect } from './FloatingWindow'
import QuickNotes from './QuickNotes'
import AIChat from './AIChat'

const CalculatorTool = lazy(() => import('./Calculator'))
const CoordinateTool = lazy(() => import('./CoordinateSystem'))
const MathSolverTool = lazy(() => import('./AIMathSolver'))
const CodeTool = lazy(() => import('./CodePlayground'))
const QuizTool = lazy(() => import('./QuizGenerator'))
const DataTool = lazy(() => import('./DataAnalyzer'))
const WhiteboardTool = lazy(() => import('./Whiteboard'))
const DocumentTool = lazy(() => import('./DocumentTools'))
const TaskTool = lazy(() => import('./TaskRoadmap'))
const AudioTool = lazy(() => import('./AudioTools'))

const TOOLS = [
  { id: 'calc', label: { en: 'Calculator', ar: 'الحاسبة' }, Icon: CalcIcon, w: 380, h: 560 },
  { id: 'notes', label: { en: 'Quick notes', ar: 'ملاحظات سريعة' }, Icon: StickyNote, w: 360, h: 380 },
  { id: 'plot', label: { en: 'Coordinates', ar: 'الإحداثيات' }, Icon: Activity, w: 780, h: 640 },
  { id: 'chat', label: { en: 'Library chat', ar: 'محادثة المكتبة' }, Icon: Bot, w: 380, h: 480 },
  { id: 'math', label: { en: 'Math solver', ar: 'حلّال الرياضيات' }, Icon: Sigma, w: 560, h: 560 },
  { id: 'code', label: { en: 'Code playground', ar: 'مساحة الأكواد' }, Icon: Terminal, w: 700, h: 640 },
  { id: 'quiz', label: { en: 'Quizzes & cards', ar: 'اختبارات وبطاقات' }, Icon: Brain, w: 620, h: 600 },
  { id: 'data', label: { en: 'Data analysis', ar: 'تحليل البيانات' }, Icon: Database, w: 760, h: 640 },
  { id: 'board', label: { en: 'Canvas & maps', ar: 'لوحة وخرائط' }, Icon: Network, w: 820, h: 600 },
  { id: 'docs', label: { en: 'Document tools', ar: 'أدوات المستندات' }, Icon: ScanText, w: 620, h: 600 },
  { id: 'tasks', label: { en: 'Tasks', ar: 'المهام' }, Icon: ListChecks, w: 560, h: 600 },
  { id: 'audio', label: { en: 'Focus & audio', ar: 'تركيز وصوت' }, Icon: Headphones, w: 480, h: 560 },
] as const

function renderTool(id: string): ReactNode {
  switch (id) {
    case 'calc': return <CalculatorTool />
    case 'notes': return <QuickNotes />
    case 'plot': return <CoordinateTool />
    case 'chat': return <AIChat />
    case 'math': return <MathSolverTool />
    case 'code': return <CodeTool />
    case 'quiz': return <QuizTool />
    case 'data': return <DataTool />
    case 'board': return <WhiteboardTool />
    case 'docs': return <DocumentTool />
    case 'tasks': return <TaskTool />
    case 'audio': return <AudioTool />
    default: return null
  }
}

class Boundary extends Component<{ children: ReactNode; locale: Locale }, { err: string }> {
  state = { err: '' }

  static getDerivedStateFromError(error: Error): { err: string } {
    return { err: error.message }
  }

  render() {
    if (this.state.err) {
      return (
        <p role="alert" className="rounded-lg bg-rose-500/10 p-4 text-sm text-rose-100">
          {tr(this.props.locale, 'This tool could not be opened. Refresh the page and try again.', 'تعذّر فتح هذه الأداة. حدّث الصفحة ثم حاول مرة أخرى.')}
        </p>
      )
    }
    return this.props.children
  }
}

interface Win {
  id: string
  z: number
  min: boolean
  rect: WinRect
}

export default function ToolsPanel() {
  const locale = useLocale()
  const { hiddenTools } = useSettings()
  const [wins, setWins] = useState<Win[]>([])
  const zRef = useRef(0)
  const slotRef = useRef(0)
  const visibleTools = TOOLS.filter(tool => !hiddenTools.includes(tool.id))

  const nextZ = (): number => {
    zRef.current += 1
    return zRef.current
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWins(current => {
        const next = current.filter(win => !hiddenTools.includes(win.id))
        return next.length === current.length ? current : next
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [hiddenTools])

  const openTool = (id: string): void => {
    const definition = TOOLS.find(tool => tool.id === id)
    if (!definition) return
    setWins(current => {
      const existing = current.find(win => win.id === id)
      if (existing) return current.map(win => win.id === id ? { ...win, z: nextZ(), min: false } : win)
      const offset = (slotRef.current % 6) * 30
      slotRef.current += 1
      return [...current, { id, z: nextZ(), min: false, rect: { x: 24 + offset, y: 80 + offset, w: definition.w, h: definition.h } }]
    })
  }

  const closeTool = (id: string): void => setWins(current => current.filter(win => win.id !== id))
  const setMin = (id: string, min: boolean): void => setWins(current => current.map(win => win.id === id ? { ...win, min } : win))
  const focusTool = (id: string): void => setWins(current => {
    const win = current.find(item => item.id === id)
    if (!win || win.z === zRef.current) return current
    return current.map(item => item.id === id ? { ...item, z: nextZ() } : item)
  })

  const onIconClick = (id: string): void => {
    const win = wins.find(item => item.id === id)
    const isTop = !!win && !win.min && win.z === zRef.current
    if (isTop) {
      sfx.close()
      closeTool(id)
    } else {
      sfx.open()
      openTool(id)
    }
  }

  useEffect(() => {
    if (!wins.length) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return
      const visible = wins.filter(win => !win.min)
      if (!visible.length) return
      const top = visible.reduce((first, second) => first.z > second.z ? first : second)
      sfx.close()
      closeTool(top.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wins])

  return (
    <>
      <div className="glass rounded-lg p-3">
        {visibleTools.length === 0 ? (
          <p className="py-2 text-center text-xs opacity-60">{tr(locale, 'All tools are hidden. Show them from Settings → Tools.', 'كل الأدوات مخفية. أظهرها من الإعدادات ← الأدوات.')}</p>
        ) : (
          <div className="ui-tools-grid grid grid-cols-4 gap-2 sm:grid-cols-6">
            {visibleTools.map(({ id, label, Icon }) => {
              const win = wins.find(item => item.id === id)
              const localizedLabel = label[locale]
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onIconClick(id)}
                  aria-pressed={!!win}
                  aria-label={localizedLabel}
                  className="relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition hover:bg-white/10 active:scale-95"
                  style={win && !win.min ? { background: ACCENT, color: '#111' } : undefined}
                >
                  <Icon size={18} />
                  {localizedLabel}
                  {win && win.min && <span className="absolute bottom-1 h-1 w-4 rounded-full" style={{ background: ACCENT }} aria-label={tr(locale, 'Minimized', 'مصغّرة')} />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {wins.map(win => {
          const definition = TOOLS.find(tool => tool.id === win.id)
          if (!definition || hiddenTools.includes(win.id)) return null
          return (
            <FloatingWindow
              key={win.id}
              title={definition.label[locale]}
              icon={<definition.Icon size={15} />}
              initial={win.rect}
              minimized={win.min}
              onMinimizeChange={minimized => setMin(win.id, minimized)}
              onClose={() => closeTool(win.id)}
              onFocus={() => focusTool(win.id)}
              zIndex={30 + win.z}
            >
              <Boundary locale={locale}>
                <Suspense fallback={<p role="status" className="py-10 text-center text-sm opacity-60">{tr(locale, 'Loading…', 'جارٍ التحميل…')}</p>}>
                  {renderTool(win.id)}
                </Suspense>
              </Boundary>
            </FloatingWindow>
          )
        })}
      </AnimatePresence>
    </>
  )
}
